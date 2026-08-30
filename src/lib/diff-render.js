/**
 * Combines a line's diff segments with its syntax-highlight runs into a single flat list of
 * spans, and turns whitespace characters into visible glyphs (always rendered - faint on
 * unchanged text, strong inside a diffed span; see DiffPane.svelte and app.css).
 *
 * Pure and DOM-free: rendering always happens through `{#each}` + text interpolation in the
 * components, never `{@html}`, so nothing here needs to escape or sanitize anything.
 */

/** @typedef {import('./text-diff.js').DiffSegment} DiffSegment */
/** @typedef {import('./syntax-highlight.js').HighlightRun} HighlightRun */

/** @typedef {{ text: string, diff: 'equal' | 'added' | 'removed', className: string | null }} MergedSpan */

/** @typedef {{ kind: 'text' | 'ws', text: string }} WhitespaceChunk */

/**
 * Two-pointer merge of diff segments and syntax-highlight runs for one line, splitting at every
 * boundary either input introduces. If the two inputs disagree on total length (which should
 * never happen when both are derived from the same line, but a mismatch must never corrupt
 * text), this falls back to the segments alone with no highlight classes rather than throwing.
 * @param {DiffSegment[]} segments
 * @param {HighlightRun[] | null | undefined} runs
 * @returns {MergedSpan[]}
 */
export function mergeRuns(segments, runs) {
  if (!runs || runs.length === 0) {
    return coalesceSpans(segments.map((s) => ({ text: s.text, diff: s.type, className: null })));
  }

  const segLen = segments.reduce((n, s) => n + s.text.length, 0);
  const runLen = runs.reduce((n, r) => n + r.text.length, 0);
  if (segLen !== runLen) {
    return coalesceSpans(segments.map((s) => ({ text: s.text, diff: s.type, className: null })));
  }

  /** @type {MergedSpan[]} */
  const out = [];
  let si = 0; // index into segments
  let sOffset = 0; // consumed chars within segments[si]
  let ri = 0; // index into runs
  let rOffset = 0; // consumed chars within runs[ri]

  while (si < segments.length && ri < runs.length) {
    const seg = segments[si];
    const run = runs[ri];
    const segRemaining = seg.text.length - sOffset;
    const runRemaining = run.text.length - rOffset;
    const take = Math.min(segRemaining, runRemaining);
    const text = seg.text.slice(sOffset, sOffset + take);

    if (text.length > 0) {
      out.push({ text, diff: seg.type, className: run.className });
    }

    sOffset += take;
    rOffset += take;
    if (sOffset >= seg.text.length) {
      si++;
      sOffset = 0;
    }
    if (rOffset >= run.text.length) {
      ri++;
      rOffset = 0;
    }
  }

  return coalesceSpans(out);
}

/**
 * Merges adjacent spans that share both diff type and highlight class.
 * @param {MergedSpan[]} spans
 * @returns {MergedSpan[]}
 */
function coalesceSpans(spans) {
  /** @type {MergedSpan[]} */
  const out = [];
  for (const span of spans) {
    if (span.text.length === 0) continue;
    const last = out[out.length - 1];
    if (last && last.diff === span.diff && last.className === span.className) {
      last.text += span.text;
    } else {
      out.push({ ...span });
    }
  }
  return out;
}

const SPACE = ' ';
const TAB = '\t';
const TAB_GLYPH = '→   '; // → + 3 non-breaking spaces
const SPACE_GLYPH = '·'; // ·

/**
 * Splits text into plain-text and whitespace chunks. Whitespace glyphs render unconditionally
 * (see DiffPane.svelte), so a run of consecutive spaces/tabs is coalesced into a single `ws`
 * chunk (one span per run, not one per character) to keep heavily-indented lines cheap to render.
 * A run-time-only transform - the diff/highlight model itself is never mutated.
 * @param {string} text
 * @returns {WhitespaceChunk[]}
 */
export function toWhitespaceChunks(text) {
  /** @type {WhitespaceChunk[]} */
  const out = [];
  let textBuffer = '';
  let wsBuffer = '';

  const flushText = () => {
    if (textBuffer.length > 0) {
      out.push({ kind: 'text', text: textBuffer });
      textBuffer = '';
    }
  };
  const flushWs = () => {
    if (wsBuffer.length > 0) {
      out.push({ kind: 'ws', text: wsBuffer });
      wsBuffer = '';
    }
  };

  for (const ch of text) {
    if (ch === SPACE) {
      flushText();
      wsBuffer += SPACE_GLYPH;
    } else if (ch === TAB) {
      flushText();
      wsBuffer += TAB_GLYPH;
    } else {
      flushWs();
      textBuffer += ch;
    }
  }
  flushText();
  flushWs();

  return out;
}
