/**
 * Pure line + character diff engine for the Diff Checker tool.
 *
 * Everything here runs entirely client-side (no DOM, no network) and is built only on
 * `diffArrays` from the `diff` package: `diffLines` keeps its newline characters attached to
 * each chunk's value, which makes trailing-newline handling fragile, so lines are split up
 * front and diffed as plain string arrays instead.
 */

import { diffArrays } from 'diff';

/**
 * @typedef {Object} DiffSegment
 * @property {string} text
 * @property {'equal' | 'added' | 'removed'} type
 */

/**
 * @typedef {Object} DiffCell
 * @property {number | null} lineNumber - 1-based; null for a filler or collapsed cell.
 * @property {'equal' | 'added' | 'removed' | 'filler' | 'collapsed'} type
 * @property {DiffSegment[]} segments - Empty for a filler cell, a collapsed cell, or a blank line.
 * @property {boolean} hasEol - Whether this line is followed by a line terminator.
 */

/**
 * @typedef {Object} DiffRow
 * @property {'equal' | 'add' | 'remove' | 'modify' | 'collapsed'} kind
 * @property {DiffCell} left
 * @property {DiffCell} right
 * @property {number} [count] - Present only when kind is 'collapsed': number of folded rows.
 */

/**
 * @typedef {Object} DiffStats
 * @property {number} linesAdded
 * @property {number} linesRemoved
 * @property {number} linesChanged
 * @property {number} charsAdded
 * @property {number} charsRemoved
 * @property {boolean} identical - Byte-exact `original === changed`.
 * @property {boolean} eolMismatch - One side uses CRLF/CR, the other LF.
 * @property {{ original: boolean, changed: boolean }} trailingNewline
 * @property {boolean} aborted - The line-level diff hit its time guardrail.
 * @property {boolean} tooLarge - The input exceeded MAX_TOTAL_CHARS and was not diffed.
 */

/**
 * @typedef {Object} DiffResult
 * @property {DiffRow[]} rows
 * @property {DiffStats} stats
 * @property {string[]} originalLines
 * @property {string[]} changedLines
 */

/**
 * @typedef {Object} ComputeDiffOptions
 * @property {number} [maxLineDiffMs]
 * @property {number} [maxCharDiffLength]
 * @property {number} [maxCharDiffMs]
 * @property {number} [similarityThreshold]
 */

const MAX_TOTAL_CHARS = 2_000_000;
const MAX_LINE_DIFF_MS = 2000;
const MAX_CHAR_DIFF_LENGTH = 1000;
const MAX_CHAR_DIFF_MS = 50;
const SIMILARITY_THRESHOLD = 0.35;

const ASCII_ONLY = /^[\x20-\x7E\t]*$/;

export const DEFAULT_ORIGINAL = `function greet(name) {
  console.log('Hello, ' + name + '!');
  return true;
}

const users = ['ada', 'grace', 'margaret'];

for (const user of users) {
  greet(user);
}
`;

export const DEFAULT_CHANGED = `function greet(name) {
  console.log(\`Hello, \${name}!\`);
  return true;
}

const users = ['ada', 'grace', 'margaret', 'katherine'];

for (const user of users) {
  greet(user);
  console.log('done with', user);
}
`;

/**
 * Normalizes CRLF and lone-CR line terminators to LF. Spaces and tabs are never touched.
 * @param {string} text
 * @returns {string}
 */
export function normalizeEol(text) {
  return text.replace(/\r\n?/g, '\n');
}

/**
 * Splits text into lines with no trailing empty line for a final newline.
 * `''` -> `[]`. `'a\n'` and `'a'` both -> `['a']`. `'a\n\n'` -> `['a', '']`.
 * @param {string} text
 * @returns {string[]}
 */
export function splitLines(text) {
  if (text === '') return [];
  const normalized = normalizeEol(text);
  const trimmed = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;
  return trimmed.split('\n');
}

let graphemeSegmenter = /** @type {Intl.Segmenter | null} */ (null);
let graphemeSegmenterChecked = false;

/** @returns {Intl.Segmenter | null} */
function getGraphemeSegmenter() {
  if (!graphemeSegmenterChecked) {
    graphemeSegmenterChecked = true;
    try {
      if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
        graphemeSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
      }
    } catch {
      graphemeSegmenter = null;
    }
  }
  return graphemeSegmenter;
}

/**
 * Splits text into grapheme clusters (ZWJ emoji, combining accents, flags stay intact).
 * ASCII-only text takes a fast path that skips constructing a segmenter.
 * @param {string} text
 * @returns {string[]}
 */
function segment(text) {
  if (text === '') return [];
  if (ASCII_ONLY.test(text)) return Array.from(text);
  const segmenter = getGraphemeSegmenter();
  if (!segmenter) return Array.from(text);
  const out = [];
  for (const { segment: piece } of segmenter.segment(text)) out.push(piece);
  return out;
}

/**
 * @param {string} text
 * @returns {number}
 */
function graphemeLength(text) {
  return segment(text).length;
}

/**
 * @param {string} text
 * @param {'equal' | 'added' | 'removed'} type
 * @returns {DiffSegment | null}
 */
function seg(text, type) {
  return text.length === 0 ? null : { text, type };
}

/**
 * @param {string} text
 * @param {'equal' | 'added' | 'removed'} type
 * @returns {DiffSegment[]}
 */
function singleSegment(text, type) {
  const s = seg(text, type);
  return s ? [s] : [];
}

/**
 * Merges adjacent segments that share a type.
 * @param {Array<DiffSegment | null>} segments
 * @returns {DiffSegment[]}
 */
function coalesce(segments) {
  /** @type {DiffSegment[]} */
  const out = [];
  for (const s of segments) {
    if (!s) continue;
    const last = out[out.length - 1];
    if (last && last.type === s.type) {
      last.text += s.text;
    } else {
      out.push({ text: s.text, type: s.type });
    }
  }
  return out;
}

/**
 * @param {number | null} lineNumber
 * @param {'equal' | 'added' | 'removed' | 'filler'} type
 * @param {DiffSegment[]} segments
 * @param {boolean} hasEol
 * @returns {DiffCell}
 */
function makeCell(lineNumber, type, segments, hasEol) {
  return { lineNumber, type, segments, hasEol };
}

/** @returns {DiffCell} */
function fillerCell() {
  return { lineNumber: null, type: 'filler', segments: [], hasEol: false };
}

/** @returns {DiffCell} */
function collapsedCell() {
  return { lineNumber: null, type: 'collapsed', segments: [], hasEol: false };
}

/**
 * @param {number} li
 * @param {number} ri
 * @param {string} line
 * @param {boolean} leftEol
 * @param {boolean} rightEol
 * @returns {DiffRow}
 */
function equalRow(li, ri, line, leftEol, rightEol) {
  return {
    kind: 'equal',
    left: makeCell(li, 'equal', singleSegment(line, 'equal'), leftEol),
    right: makeCell(ri, 'equal', singleSegment(line, 'equal'), rightEol)
  };
}

/**
 * @param {number} li
 * @param {string} line
 * @param {boolean} leftEol
 * @returns {DiffRow}
 */
function removeRow(li, line, leftEol) {
  return {
    kind: 'remove',
    left: makeCell(li, 'removed', singleSegment(line, 'removed'), leftEol),
    right: fillerCell()
  };
}

/**
 * @param {number} ri
 * @param {string} line
 * @param {boolean} rightEol
 * @returns {DiffRow}
 */
function addRow(ri, line, rightEol) {
  return {
    kind: 'add',
    left: fillerCell(),
    right: makeCell(ri, 'added', singleSegment(line, 'added'), rightEol)
  };
}

/**
 * @param {number} index0 - 0-based line index.
 * @param {string[]} lines
 * @param {boolean} hasTrailingNewline
 * @returns {boolean}
 */
function hasEolFor(index0, lines, hasTrailingNewline) {
  return index0 < lines.length - 1 || hasTrailingNewline;
}

/**
 * Character-level diff between two lines that are known to differ.
 * @param {string} a
 * @param {string} b
 * @param {{ maxCharDiffLength: number, maxCharDiffMs: number, similarityThreshold: number }} opts
 * @returns {{ left: DiffSegment[], right: DiffSegment[] }}
 */
function charDiffLine(a, b, opts) {
  if (a === b) {
    return { left: singleSegment(a, 'equal'), right: singleSegment(b, 'equal') };
  }

  const wholeLine = () => ({
    left: singleSegment(a, 'removed'),
    right: singleSegment(b, 'added')
  });

  if (Math.max(a.length, b.length) > opts.maxCharDiffLength) {
    return wholeLine();
  }

  const aTok = segment(a);
  const bTok = segment(b);
  const minLen = Math.min(aTok.length, bTok.length);

  let prefixLen = 0;
  while (prefixLen < minLen && aTok[prefixLen] === bTok[prefixLen]) prefixLen++;

  let suffixLen = 0;
  const maxSuffix = minLen - prefixLen;
  while (
    suffixLen < maxSuffix &&
    aTok[aTok.length - 1 - suffixLen] === bTok[bTok.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const prefix = aTok.slice(0, prefixLen).join('');
  const suffix = suffixLen === 0 ? '' : aTok.slice(aTok.length - suffixLen).join('');
  const aMidTok = aTok.slice(prefixLen, aTok.length - suffixLen);
  const bMidTok = bTok.slice(prefixLen, bTok.length - suffixLen);

  if (aMidTok.length === 0 && bMidTok.length === 0) {
    return { left: singleSegment(a, 'equal'), right: singleSegment(b, 'equal') };
  }

  const maxLen = Math.max(aTok.length, bTok.length);
  const similarity = maxLen === 0 ? 1 : (prefixLen + suffixLen) / maxLen;
  if (similarity < opts.similarityThreshold) {
    return wholeLine();
  }

  const midDiff = diffArrays(aMidTok, bMidTok, { timeout: opts.maxCharDiffMs });
  if (!midDiff) {
    return wholeLine();
  }

  /** @type {Array<DiffSegment | null>} */
  const leftParts = [seg(prefix, 'equal')];
  /** @type {Array<DiffSegment | null>} */
  const rightParts = [seg(prefix, 'equal')];

  for (const part of midDiff) {
    const text = /** @type {string[]} */ (part.value).join('');
    if (part.added) {
      rightParts.push(seg(text, 'added'));
    } else if (part.removed) {
      leftParts.push(seg(text, 'removed'));
    } else {
      leftParts.push(seg(text, 'equal'));
      rightParts.push(seg(text, 'equal'));
    }
  }

  leftParts.push(seg(suffix, 'equal'));
  rightParts.push(seg(suffix, 'equal'));

  return { left: coalesce(leftParts), right: coalesce(rightParts) };
}

/**
 * Computes an aligned line-and-character diff between two texts.
 * @param {string} original
 * @param {string} changed
 * @param {ComputeDiffOptions} [options]
 * @returns {DiffResult}
 */
export function computeDiff(original, changed, options = {}) {
  const maxLineDiffMs = options.maxLineDiffMs ?? MAX_LINE_DIFF_MS;
  const maxCharDiffLength = options.maxCharDiffLength ?? MAX_CHAR_DIFF_LENGTH;
  const maxCharDiffMs = options.maxCharDiffMs ?? MAX_CHAR_DIFF_MS;
  const similarityThreshold = options.similarityThreshold ?? SIMILARITY_THRESHOLD;
  const charOpts = { maxCharDiffLength, maxCharDiffMs, similarityThreshold };

  const identical = original === changed;
  const eolMismatch = /\r/.test(original) !== /\r/.test(changed);
  const originalLines = splitLines(original);
  const changedLines = splitLines(changed);
  const trailingNewline = {
    original: original.length > 0 && normalizeEol(original).endsWith('\n'),
    changed: changed.length > 0 && normalizeEol(changed).endsWith('\n')
  };

  const stats = {
    linesAdded: 0,
    linesRemoved: 0,
    linesChanged: 0,
    charsAdded: 0,
    charsRemoved: 0,
    identical,
    eolMismatch,
    trailingNewline,
    aborted: false,
    tooLarge: false
  };

  if (original.length + changed.length > MAX_TOTAL_CHARS) {
    stats.tooLarge = true;
    return { rows: [], stats, originalLines, changedLines };
  }

  if (identical) {
    const rows = originalLines.map((line, idx) => {
      const eol = hasEolFor(idx, originalLines, trailingNewline.original);
      return equalRow(idx + 1, idx + 1, line, eol, eol);
    });
    return { rows, stats, originalLines, changedLines };
  }

  const changes = diffArrays(originalLines, changedLines, { timeout: maxLineDiffMs });

  if (!changes) {
    stats.aborted = true;
    /** @type {DiffRow[]} */
    const rows = [];
    originalLines.forEach((line, idx) => {
      rows.push(removeRow(idx + 1, line, hasEolFor(idx, originalLines, trailingNewline.original)));
      stats.linesRemoved++;
      stats.charsRemoved += graphemeLength(line);
    });
    changedLines.forEach((line, idx) => {
      rows.push(addRow(idx + 1, line, hasEolFor(idx, changedLines, trailingNewline.changed)));
      stats.linesAdded++;
      stats.charsAdded += graphemeLength(line);
    });
    return { rows, stats, originalLines, changedLines };
  }

  /** @type {DiffRow[]} */
  const rows = [];
  let li = 0;
  let ri = 0;
  let i = 0;

  while (i < changes.length) {
    const chunk = changes[i];

    if (!chunk.added && !chunk.removed) {
      for (const line of /** @type {string[]} */ (chunk.value)) {
        li++;
        ri++;
        const leftEol = hasEolFor(li - 1, originalLines, trailingNewline.original);
        const rightEol = hasEolFor(ri - 1, changedLines, trailingNewline.changed);
        rows.push(equalRow(li, ri, line, leftEol, rightEol));
      }
      i++;
      continue;
    }

    /** @type {string[]} */
    const removedLines = [];
    /** @type {string[]} */
    const addedLines = [];
    while (i < changes.length && (changes[i].added || changes[i].removed)) {
      if (changes[i].removed) removedLines.push(.../** @type {string[]} */ (changes[i].value));
      else addedLines.push(.../** @type {string[]} */ (changes[i].value));
      i++;
    }

    const pairs = Math.min(removedLines.length, addedLines.length);

    for (let k = 0; k < pairs; k++) {
      li++;
      ri++;
      const a = removedLines[k];
      const b = addedLines[k];
      const leftEol = hasEolFor(li - 1, originalLines, trailingNewline.original);
      const rightEol = hasEolFor(ri - 1, changedLines, trailingNewline.changed);

      if (a === b) {
        rows.push(equalRow(li, ri, a, leftEol, rightEol));
        continue;
      }

      const { left, right } = charDiffLine(a, b, charOpts);
      rows.push({
        kind: 'modify',
        left: makeCell(li, 'removed', left, leftEol),
        right: makeCell(ri, 'added', right, rightEol)
      });
      stats.linesChanged++;
      for (const s of left) if (s.type === 'removed') stats.charsRemoved += graphemeLength(s.text);
      for (const s of right) if (s.type === 'added') stats.charsAdded += graphemeLength(s.text);
    }

    for (let k = pairs; k < removedLines.length; k++) {
      li++;
      rows.push(
        removeRow(li, removedLines[k], hasEolFor(li - 1, originalLines, trailingNewline.original))
      );
      stats.linesRemoved++;
      stats.charsRemoved += graphemeLength(removedLines[k]);
    }

    for (let k = pairs; k < addedLines.length; k++) {
      ri++;
      rows.push(
        addRow(ri, addedLines[k], hasEolFor(ri - 1, changedLines, trailingNewline.changed))
      );
      stats.linesAdded++;
      stats.charsAdded += graphemeLength(addedLines[k]);
    }
  }

  return { rows, stats, originalLines, changedLines };
}

/**
 * Folds long runs of unchanged rows into a single collapsed marker, keeping `context` rows of
 * surrounding equal lines on each side of every real change.
 * @param {DiffRow[]} rows
 * @param {number} [context]
 * @returns {DiffRow[]}
 */
export function collapseRows(rows, context = 3) {
  const threshold = 2 * context + 1;
  /** @type {DiffRow[]} */
  const out = [];
  let i = 0;

  while (i < rows.length) {
    if (rows[i].kind !== 'equal') {
      out.push(rows[i]);
      i++;
      continue;
    }

    let j = i;
    while (j < rows.length && rows[j].kind === 'equal') j++;
    const runLength = j - i;

    if (runLength <= threshold) {
      for (let k = i; k < j; k++) out.push(rows[k]);
      i = j;
      continue;
    }

    const isStart = i === 0;
    const isEnd = j === rows.length;
    const headCount = isStart ? 0 : context;
    const tailCount = isEnd ? 0 : context;
    const collapsedCount = runLength - headCount - tailCount;

    for (let k = i; k < i + headCount; k++) out.push(rows[k]);
    out.push({
      kind: 'collapsed',
      left: collapsedCell(),
      right: collapsedCell(),
      count: collapsedCount
    });
    for (let k = j - tailCount; k < j; k++) out.push(rows[k]);

    i = j;
  }

  return out;
}
