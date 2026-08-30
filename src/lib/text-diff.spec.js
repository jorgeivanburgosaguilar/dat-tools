import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ORIGINAL,
  DEFAULT_CHANGED,
  normalizeEol,
  splitLines,
  computeDiff,
  collapseRows
} from './text-diff.js';

/** @param {import('./text-diff.js').DiffSegment[]} segments @param {'added'|'removed'} type */
function textOf(segments, type) {
  return segments
    .filter((s) => s.type === type)
    .map((s) => s.text)
    .join('');
}

/** @param {import('./text-diff.js').DiffCell} cell */
function cellText(cell) {
  return cell.segments.map((s) => s.text).join('');
}

describe('normalizeEol', () => {
  it('converts CRLF to LF', () => {
    expect(normalizeEol('a\r\nb')).toBe('a\nb');
  });

  it('converts lone CR to LF', () => {
    expect(normalizeEol('a\rb')).toBe('a\nb');
  });

  it('leaves LF-only text untouched', () => {
    expect(normalizeEol('a\nb')).toBe('a\nb');
  });
});

describe('splitLines', () => {
  it('returns an empty array for empty input', () => {
    expect(splitLines('')).toEqual([]);
  });

  it('splits text with no trailing newline', () => {
    expect(splitLines('a')).toEqual(['a']);
  });

  it('does not add a phantom line for a trailing newline', () => {
    expect(splitLines('a\n')).toEqual(['a']);
  });

  it('keeps a genuine trailing blank line', () => {
    expect(splitLines('a\n\n')).toEqual(['a', '']);
  });

  it('handles a lone newline as one blank line', () => {
    expect(splitLines('\n')).toEqual(['']);
  });

  it('normalizes CRLF before splitting', () => {
    expect(splitLines('a\r\nb')).toEqual(['a', 'b']);
  });
});

describe('computeDiff - whitespace precision', () => {
  it('detects a single space added mid-line', () => {
    const result = computeDiff('a b', 'a  b');
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row.kind).toBe('modify');
    expect(textOf(row.right.segments, 'added')).toBe(' ');
    expect(textOf(row.left.segments, 'removed')).toBe('');
    expect(result.stats.charsAdded).toBe(1);
    expect(result.stats.charsRemoved).toBe(0);
  });

  it('detects a single space removed mid-line', () => {
    const result = computeDiff('a  b', 'a b');
    const row = result.rows[0];
    expect(row.kind).toBe('modify');
    expect(textOf(row.left.segments, 'removed')).toBe(' ');
    expect(result.stats.charsRemoved).toBe(1);
    expect(result.stats.charsAdded).toBe(0);
  });

  it('detects a single trailing space added at end of line', () => {
    const result = computeDiff('foo', 'foo ');
    const row = result.rows[0];
    expect(textOf(row.right.segments, 'added')).toBe(' ');
    expect(cellText(row.right)).toBe('foo ');
  });

  it('detects added leading indentation', () => {
    const result = computeDiff('  foo', '    foo');
    const row = result.rows[0];
    expect(textOf(row.right.segments, 'added')).toBe('  ');
    expect(cellText(row.right)).toBe('    foo');
    // the unchanged "foo" survives as an equal segment
    expect(row.right.segments.some((s) => s.type === 'equal' && s.text === 'foo')).toBe(true);
  });

  it('treats a tab and four spaces as different, not equal', () => {
    const result = computeDiff('\tfoo', '    foo');
    const row = result.rows[0];
    expect(row.kind).toBe('modify');
    expect(textOf(row.left.segments, 'removed')).toBe('\t');
    expect(textOf(row.right.segments, 'added')).toBe('    ');
  });

  it('detects a double space collapsed to a single space', () => {
    const result = computeDiff('a  b', 'a b');
    const row = result.rows[0];
    expect(textOf(row.left.segments, 'removed')).toBe(' ');
  });

  it('distinguishes a whitespace-only line from an empty line', () => {
    // splitLines(' ') is one line [' ']; splitLines('') is zero lines - a pure removal,
    // not a paired modification, since the "changed" side has no line at all.
    const result = computeDiff(' ', '');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].kind).toBe('remove');
    expect(cellText(result.rows[0].left)).toBe(' ');
    expect(result.rows[0].right.type).toBe('filler');
  });
});

describe('computeDiff - line endings and EOF', () => {
  it('flags a CRLF vs LF mismatch without marking every line changed', () => {
    const result = computeDiff('a\r\nb', 'a\nb');
    expect(result.stats.eolMismatch).toBe(true);
    expect(result.stats.identical).toBe(false);
    expect(result.rows.every((r) => r.kind === 'equal')).toBe(true);
  });

  it('reports a trailing newline added at EOF with no phantom row', () => {
    const result = computeDiff('a\nb', 'a\nb\n');
    expect(result.rows).toHaveLength(2);
    expect(result.stats.trailingNewline).toEqual({ original: false, changed: true });
    expect(result.stats.identical).toBe(false);
    const last = result.rows[1];
    expect(last.left.hasEol).toBe(false);
    expect(last.right.hasEol).toBe(true);
  });

  it('treats a second trailing newline as a genuine added blank line', () => {
    const result = computeDiff('a\nb\n', 'a\nb\n\n');
    expect(result.rows).toHaveLength(3);
    expect(result.rows[2].kind).toBe('add');
    expect(cellText(/** @type {import('./text-diff.js').DiffCell} */ (result.rows[2].right))).toBe(
      ''
    );
  });
});

describe('computeDiff - degenerate inputs', () => {
  it('returns zero rows and identical:true for two empty strings', () => {
    const result = computeDiff('', '');
    expect(result.rows).toHaveLength(0);
    expect(result.stats.identical).toBe(true);
    expect(result.stats.linesAdded).toBe(0);
    expect(result.stats.linesRemoved).toBe(0);
    expect(result.stats.charsAdded).toBe(0);
    expect(result.stats.charsRemoved).toBe(0);
  });

  it('marks every row as added when original is empty', () => {
    const result = computeDiff('', 'a\nb');
    expect(result.rows.every((r) => r.kind === 'add')).toBe(true);
    expect(result.rows.every((r) => r.left.type === 'filler' && r.left.lineNumber === null)).toBe(
      true
    );
    expect(result.stats.linesAdded).toBe(2);
  });

  it('marks every row as removed when changed is empty', () => {
    const result = computeDiff('a\nb', '');
    expect(result.rows.every((r) => r.kind === 'remove')).toBe(true);
    expect(result.rows.every((r) => r.right.type === 'filler' && r.right.lineNumber === null)).toBe(
      true
    );
    expect(result.stats.linesRemoved).toBe(2);
  });

  it('marks identical multi-line text as fully equal with no filler', () => {
    const text = 'a\nb\nc';
    const result = computeDiff(text, text);
    expect(result.rows.every((r) => r.kind === 'equal')).toBe(true);
    expect(result.rows.every((r) => r.left.type !== 'filler' && r.right.type !== 'filler')).toBe(
      true
    );
  });
});

describe('computeDiff - structure', () => {
  it('marks exactly one changed character in a long line', () => {
    const a = 'x'.repeat(2500) + 'A' + 'x'.repeat(2500);
    const b = 'x'.repeat(2500) + 'B' + 'x'.repeat(2500);
    const result = computeDiff(a, b, { maxCharDiffLength: 6000 });
    const row = result.rows[0];
    const removed = row.left.segments.filter((s) => s.type === 'removed');
    const added = row.right.segments.filter((s) => s.type === 'added');
    expect(removed).toHaveLength(1);
    expect(added).toHaveLength(1);
    expect(removed[0].text).toBe('A');
    expect(added[0].text).toBe('B');
  });

  it('marks an oversize line as a whole-line change with no inline marks', () => {
    const a = 'a'.repeat(2000);
    const b = 'b'.repeat(2000);
    const result = computeDiff(a, b);
    const row = result.rows[0];
    expect(row.left.segments).toHaveLength(1);
    expect(row.right.segments).toHaveLength(1);
    expect(row.left.segments[0].type).toBe('removed');
    expect(row.right.segments[0].type).toBe('added');
  });

  it('keeps a pair of dissimilar lines on one row without inline marks', () => {
    const result = computeDiff('completely different content here', 'totally unrelated other line');
    const row = result.rows[0];
    expect(row.kind).toBe('modify');
    expect(row.left.segments).toHaveLength(1);
    expect(row.left.segments[0].type).toBe('removed');
    expect(row.right.segments).toHaveLength(1);
    expect(row.right.segments[0].type).toBe('added');
  });

  it('pairs an unbalanced hunk into one modify plus extra adds, with gapless numbering', () => {
    const result = computeDiff('one', 'one\ntwo\nthree');
    // "one" unchanged; "two" and "three" are pure additions after it.
    expect(result.rows.map((r) => r.kind)).toEqual(['equal', 'add', 'add']);
    const leftNumbers = result.rows.map((r) => r.left.lineNumber).filter((n) => n !== null);
    const rightNumbers = result.rows.map((r) => r.right.lineNumber);
    expect(leftNumbers).toEqual([1]);
    expect(rightNumbers).toEqual([1, 2, 3]);
  });

  it('keeps line numbering correct on both sides after a mid-file insertion', () => {
    const result = computeDiff('a\nb\nc', 'a\nX\nb\nc');
    const last = result.rows[result.rows.length - 1];
    expect(cellText(last.left)).toBe('c');
    expect(cellText(last.right)).toBe('c');
    expect(last.left.lineNumber).toBe(3);
    expect(last.right.lineNumber).toBe(4);
  });
});

describe('computeDiff - unicode', () => {
  it('keeps a ZWJ family emoji intact and produces no lone surrogate', () => {
    const family = '\u{1F468}‍\u{1F469}‍\u{1F467}'; // 👨‍👩‍👧
    const result = computeDiff(`${family} a`, `${family} b`);
    const row = result.rows[0];
    const equalWithFamily = row.left.segments.find((s) => s.text.includes(family));
    expect(equalWithFamily?.type).toBe('equal');

    const loneSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    for (const segment of [...row.left.segments, ...row.right.segments]) {
      expect(loneSurrogate.test(segment.text)).toBe(false);
    }
  });

  it('keeps a combining accent attached to its base character', () => {
    const result = computeDiff('café', 'cafe');
    const row = result.rows[0];
    expect(row.kind).toBe('modify');
    expect(textOf(row.left.segments, 'removed')).toBe('é');
  });

  it('round-trips CJK text unchanged when only ASCII differs', () => {
    const result = computeDiff('你好 a', '你好 b');
    const row = result.rows[0];
    const equalCjk = row.left.segments.find((s) => s.text.startsWith('你'));
    expect(equalCjk?.text).toBe('你好 ');
  });
});

describe('computeDiff - guardrails', () => {
  it('aborts gracefully when the line-level diff exceeds its time budget', () => {
    const a = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n');
    const b = Array.from({ length: 50 }, (_, i) => `changed ${i}`).join('\n');
    const result = computeDiff(a, b, { maxLineDiffMs: 0 });
    expect(result.stats.aborted).toBe(true);
    expect(() => computeDiff(a, b, { maxLineDiffMs: 0 })).not.toThrow();
    expect(result.rows.some((r) => r.kind === 'remove')).toBe(true);
    expect(result.rows.some((r) => r.kind === 'add')).toBe(true);
  });

  it('refuses to diff input above the total character guardrail', () => {
    const big = 'a'.repeat(1_200_000);
    const result = computeDiff(big, big + 'b', { maxLineDiffMs: 2000 });
    // 1_200_000 + 1_200_001 > 2_000_000
    expect(result.stats.tooLarge).toBe(true);
    expect(result.rows).toHaveLength(0);
  });
});

describe('computeDiff - reconstruction invariant', () => {
  /** @type {[string, string][]} */
  const fixtures = [
    ['', ''],
    ['a', 'b'],
    ['a\nb\nc', 'a\nx\nc'],
    ['line1\nline2\n', 'line1\nline2\nline3\n'],
    ['foo bar', 'foo  bar'],
    ['a\r\nb', 'a\nb\nc']
  ];

  it.each(fixtures)('reproduces both sides exactly for %j vs %j', (original, changed) => {
    const result = computeDiff(original, changed);
    const left = result.rows
      .filter((r) => r.left && r.left.type !== 'filler')
      .map((r) => cellText(/** @type {import('./text-diff.js').DiffCell} */ (r.left)))
      .join('\n');
    const right = result.rows
      .filter((r) => r.right && r.right.type !== 'filler')
      .map((r) => cellText(/** @type {import('./text-diff.js').DiffCell} */ (r.right)))
      .join('\n');
    expect(left).toBe(result.originalLines.join('\n'));
    expect(right).toBe(result.changedLines.join('\n'));
  });
});

describe('sample content', () => {
  it('provides non-identical, non-empty default samples with a mix of row kinds', () => {
    expect(DEFAULT_ORIGINAL.length).toBeGreaterThan(0);
    expect(DEFAULT_CHANGED.length).toBeGreaterThan(0);
    const result = computeDiff(DEFAULT_ORIGINAL, DEFAULT_CHANGED);
    expect(result.stats.identical).toBe(false);
    const kinds = new Set(result.rows.map((r) => r.kind));
    expect(kinds.has('equal')).toBe(true);
    expect(kinds.size).toBeGreaterThan(1);
  });
});

describe('collapseRows', () => {
  it('folds a long unchanged run in the middle of a file, keeping 3 rows of context each side', () => {
    const original = Array.from({ length: 101 }, (_, i) => (i === 50 ? 'CHANGED-A' : `l${i}`)).join(
      '\n'
    );
    const changed = Array.from({ length: 101 }, (_, i) => (i === 50 ? 'CHANGED-B' : `l${i}`)).join(
      '\n'
    );
    const rows = computeDiff(original, changed).rows;
    const collapsed = collapseRows(rows, 3);
    const collapsedRows = collapsed.filter((r) => r.kind === 'collapsed');
    expect(collapsedRows).toHaveLength(2);
    // 50 equal rows before the change, minus 3 kept as context = 47 collapsed.
    expect(collapsedRows[0].count).toBe(47);
  });

  it('does not collapse a run at or below the threshold', () => {
    const rows = computeDiff('a\nb\nc\nd\ne\nf\ng', 'a\nb\nc\nd\ne\nf\nX').rows;
    const collapsed = collapseRows(rows, 3);
    expect(collapsed.some((r) => r.kind === 'collapsed')).toBe(false);
  });

  it('collapses a run at the very start of the file with no head context', () => {
    const original = Array.from({ length: 20 }, (_, i) => `l${i}`).join('\n') + '\nCHANGED';
    const changed = Array.from({ length: 20 }, (_, i) => `l${i}`).join('\n') + '\nOTHER';
    const rows = computeDiff(original, changed).rows;
    const collapsed = collapseRows(rows, 3);
    expect(collapsed[0].kind).toBe('collapsed');
    expect(collapsed[0].count).toBe(17);
  });

  it('collapses a run at the very end of the file with no tail context', () => {
    const original = 'CHANGED\n' + Array.from({ length: 20 }, (_, i) => `l${i}`).join('\n');
    const changed = 'OTHER\n' + Array.from({ length: 20 }, (_, i) => `l${i}`).join('\n');
    const rows = computeDiff(original, changed).rows;
    const collapsed = collapseRows(rows, 3);
    const last = collapsed[collapsed.length - 1];
    expect(last.kind).toBe('collapsed');
    expect(last.count).toBe(17);
  });
});
