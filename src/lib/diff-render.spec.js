import { describe, it, expect } from 'vitest';
import { mergeRuns, toWhitespaceChunks } from './diff-render.js';

/**
 * @param {string} text
 * @param {import('./text-diff.js').DiffSegment['type']} type
 * @returns {import('./text-diff.js').DiffSegment}
 */
function seg(text, type) {
  return { text, type };
}

const NBSP = ' ';
const TAB_GLYPH = `→${NBSP.repeat(3)}`;
const SPACE_GLYPH = '·';

describe('mergeRuns', () => {
  it('passes segments through unchanged when there are no highlight runs', () => {
    const segments = [seg('foo', 'equal'), seg('bar', 'added')];
    const spans = mergeRuns(segments, null);
    expect(spans).toEqual([
      { text: 'foo', diff: 'equal', className: null },
      { text: 'bar', diff: 'added', className: null }
    ]);
  });

  it('splits a highlight run at a diff segment boundary', () => {
    // one run "constab" but the diff sees "const" equal + "ab" added
    const segments = [seg('const', 'equal'), seg('ab', 'added')];
    const runs = [{ text: 'constab', className: 'hljs-keyword' }];
    const spans = mergeRuns(segments, runs);
    expect(spans).toEqual([
      { text: 'const', diff: 'equal', className: 'hljs-keyword' },
      { text: 'ab', diff: 'added', className: 'hljs-keyword' }
    ]);
  });

  it('splits a diff segment at a highlight run boundary', () => {
    const segments = [seg('foobar', 'equal')];
    const runs = [
      { text: 'foo', className: 'hljs-keyword' },
      { text: 'bar', className: null }
    ];
    const spans = mergeRuns(segments, runs);
    expect(spans).toEqual([
      { text: 'foo', diff: 'equal', className: 'hljs-keyword' },
      { text: 'bar', diff: 'equal', className: null }
    ]);
  });

  it('emits no zero-length span when boundaries coincide exactly', () => {
    const segments = [seg('foo', 'equal'), seg('bar', 'added')];
    const runs = [
      { text: 'foo', className: 'a' },
      { text: 'bar', className: 'b' }
    ];
    const spans = mergeRuns(segments, runs);
    expect(spans.every((s) => s.text.length > 0)).toBe(true);
    expect(spans).toHaveLength(2);
  });

  it('always reconstructs the original text', () => {
    const cases = [
      { segments: [seg('abc', 'equal')], runs: [{ text: 'abc', className: 'x' }] },
      {
        segments: [seg('a', 'removed'), seg('bcd', 'equal')],
        runs: [
          { text: 'ab', className: 'x' },
          { text: 'cd', className: 'y' }
        ]
      },
      { segments: [seg('hello world', 'equal')], runs: null },
      {
        segments: [seg('  ', 'added'), seg('foo', 'equal')],
        runs: [{ text: '  foo', className: null }]
      },
      { segments: [], runs: [] }
    ];
    for (const { segments, runs } of cases) {
      const spans = mergeRuns(segments, runs);
      const expected = segments.map((s) => s.text).join('');
      expect(spans.map((s) => s.text).join('')).toBe(expected);
    }
  });

  it('falls back to segments-only when run and segment lengths disagree', () => {
    const segments = [seg('abcdef', 'equal')];
    const runs = [{ text: 'abc', className: 'x' }]; // shorter than the segment text
    expect(() => mergeRuns(segments, runs)).not.toThrow();
    const spans = mergeRuns(segments, runs);
    expect(spans.map((s) => s.text).join('')).toBe('abcdef');
    expect(spans.every((s) => s.className === null)).toBe(true);
  });

  it('returns an empty array for an empty line', () => {
    expect(mergeRuns([], [])).toEqual([]);
    expect(mergeRuns([], null)).toEqual([]);
  });

  it('preserves the diff type on every span', () => {
    const segments = [seg('a', 'removed'), seg('b', 'added'), seg('c', 'equal')];
    const spans = mergeRuns(segments, null);
    expect(spans.map((s) => s.diff)).toEqual(['removed', 'added', 'equal']);
  });
});

describe('toWhitespaceChunks', () => {
  it('turns a single space into a middle dot chunk', () => {
    expect(toWhitespaceChunks('a b')).toEqual([
      { kind: 'text', text: 'a' },
      { kind: 'ws', text: SPACE_GLYPH },
      { kind: 'text', text: 'b' }
    ]);
  });

  it('marks leading and trailing spaces', () => {
    const chunks = toWhitespaceChunks(' a ');
    expect(chunks[0]).toEqual({ kind: 'ws', text: SPACE_GLYPH });
    expect(chunks[chunks.length - 1]).toEqual({ kind: 'ws', text: SPACE_GLYPH });
  });

  it('renders exactly one dot per consecutive space, preserving column count', () => {
    const chunks = toWhitespaceChunks('a   b');
    const wsChunks = chunks.filter((c) => c.kind === 'ws');
    expect(wsChunks).toHaveLength(3);
    expect(wsChunks.every((c) => c.text === SPACE_GLYPH)).toBe(true);
  });

  it('renders a tab as an arrow plus three non-breaking spaces', () => {
    expect(toWhitespaceChunks('\tfoo')).toEqual([
      { kind: 'ws', text: TAB_GLYPH },
      { kind: 'text', text: 'foo' }
    ]);
  });

  it('returns a single text chunk when there is no whitespace', () => {
    expect(toWhitespaceChunks('abcdef')).toEqual([{ kind: 'text', text: 'abcdef' }]);
  });

  it('returns an empty array for an empty string', () => {
    expect(toWhitespaceChunks('')).toEqual([]);
  });

  it('returns other text verbatim, proving there is no escaping path', () => {
    const chunks = toWhitespaceChunks('<script>alert(1)</script>');
    expect(chunks.map((c) => c.text).join('')).toBe('<script>alert(1)</script>');
  });
});
