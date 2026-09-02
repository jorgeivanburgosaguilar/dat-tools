/**
 * Renders a trajectory step's free-text fields (message, observation content) as sanitized HTML,
 * auto-detecting whether the text reads as markdown, raw HTML, or plain prose so each renders the
 * way it was clearly meant to be read instead of one-size-fits-all markdown parsing.
 *
 * Mirrors `markdown-preview.js`'s DOMPurify usage (see that file's header comment for why the
 * `DOMPurify.isSupported` guard is safe: SSR/prerendering has no `window`, so this only ever skips
 * sanitization against trusted build-time content, never real trajectory data, which is always
 * loaded and rendered client-side).
 *
 * Deliberately does NOT call `marked.use()` on the shared `marked` singleton the way
 * `markdown-preview.js` does for its scroll-sync renderer - that would leak this module's `code`
 * renderer into Markdown Preview's output (and vice versa). A fresh `new Marked()` instance is
 * built per render instead, closing over the caller's `lowlight` handle so its `code` renderer can
 * produce highlighted markup synchronously.
 */

import { Marked } from 'marked';
import DOMPurify from 'dompurify';
import { detectLanguage, highlightToHtml } from './syntax-highlight.js';

/** @typedef {import('./syntax-highlight.js').Lowlight} Lowlight */

// eslint-disable-next-line no-control-regex -- the ESC (0x1b) byte is the actual character being matched
const ANSI_PATTERN = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

/**
 * Strips ANSI escape (color/cursor) sequences from terminal output. Defensive: the bundled
 * samples are already clean, but real terminal captures often aren't.
 * @param {string} text
 * @returns {string}
 */
export function stripAnsi(text) {
  return typeof text === 'string' ? text.replace(ANSI_PATTERN, '') : text;
}

const HTML_TAG_PATTERN =
  /<\/?(?:div|span|p|table|thead|tbody|tr|td|th|a|img|br|hr|h[1-6]|ul|ol|li|strong|em|b|i|code|pre|blockquote|details|summary|kbd)\b[^>]*>/gi;

const MARKDOWN_PATTERNS = [
  /^#{1,6}\s+\S/m, // ATX heading
  /^\s*[-*+]\s+\S/m, // unordered list item
  /^\s*\d+\.\s+\S/m, // ordered list item
  /```/, // fenced code
  /\*\*[^*\n]+\*\*/, // bold
  /^\s*>\s+\S/m, // blockquote
  /\[[^\]]+]\([^)]+\)/, // link
  /^\s*\|.+\|\s*$/m // table row
];

/**
 * Classifies free text so `renderRichText` knows which renderer to use.
 * - `html`: several real HTML tags and no markdown syntax at all -> treat as a raw HTML document.
 * - `markdown`: any markdown syntax, or HTML mixed with markdown (markdown passes raw HTML
 *   through, same as `markdown-preview.js`'s DEFAULT_CONTENT does with `<details>`/`<kbd>`).
 * - `text`: plain prose - rendered as-is with preserved line breaks, never markdown-parsed, so
 *   ordinary terminal-ish sentences aren't accidentally mangled by stray `*`/`-`/`#` characters.
 * @param {string} text
 * @returns {'html' | 'markdown' | 'text'}
 */
export function classifyContent(text) {
  if (typeof text !== 'string' || !text.trim()) return 'text';
  const tagMatches = text.match(HTML_TAG_PATTERN) ?? [];
  const looksLikeMarkdown = MARKDOWN_PATTERNS.some((pattern) => pattern.test(text));
  if (tagMatches.length >= 2 && !looksLikeMarkdown) return 'html';
  if (looksLikeMarkdown || tagMatches.length > 0) return 'markdown';
  return 'text';
}

/**
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Best-effort language guess for a fenced code block with no (or an unrecognized) info string,
 * or for a code argument rendered on its own (e.g. shell keystrokes). Falls back to `fallback`
 * when there's no loaded highlighter or detection isn't confident - never forces a guess.
 * @param {string} text
 * @param {string} [fallback]
 * @param {Lowlight | null} [lowlight]
 * @returns {string}
 */
export function guessCodeLanguage(text, fallback = 'plain', lowlight = null) {
  const detected = lowlight ? detectLanguage(text, lowlight) : null;
  return detected ?? fallback;
}

/**
 * Builds a `code` renderer closing over `lowlight`, so `new Marked()` instances stay purely a
 * function of the caller's already-resolved highlighter handle.
 * @param {Lowlight | null} lowlight
 */
function codeRenderer(lowlight) {
  /** @param {{ text: string, lang?: string }} token */
  return function code(token) {
    const infoLang = (token.lang ?? '').trim().split(/\s+/)[0];
    const language = infoLang || guessCodeLanguage(token.text, '', lowlight);
    const inner =
      language && lowlight
        ? highlightToHtml(token.text, language, lowlight)
        : escapeHtml(token.text);
    const langClass = language ? ` class="language-${language}"` : '';
    return `<pre><code${langClass}>${inner}</code></pre>\n`;
  };
}

/**
 * Parses `text` per `classifyContent()` and returns sanitized HTML ready for `{@html}`.
 * @param {string} text
 * @param {Lowlight | null} [lowlight]
 * @returns {string}
 */
export function renderRichText(text, lowlight = null) {
  if (typeof text !== 'string' || !text) return '';
  const kind = classifyContent(text);

  /** @type {string} */
  let raw;
  if (kind === 'html') {
    raw = text;
  } else if (kind === 'markdown') {
    const marked = new Marked({ gfm: true, breaks: true });
    marked.use({ renderer: { code: codeRenderer(lowlight) } });
    raw = /** @type {string} */ (marked.parse(text));
  } else {
    raw = `<p>${escapeHtml(text).replace(/\n/g, '<br>\n')}</p>`;
  }

  return DOMPurify.isSupported ? DOMPurify.sanitize(raw) : raw;
}
