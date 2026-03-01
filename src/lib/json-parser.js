export const DEFAULT_CONTENT = `{
  "name": "dat-tools",
  "description": "Privacy-first browser utilities for developers",
  "version": "1.0.0",
  "features": [
    "100% client-side processing",
    "No analytics or tracking",
    "Self-hostable via Docker"
  ],
  "tools": {
    "stopwatch": { "status": "available" },
    "json-parser": { "status": "available" },
    "word-counter": { "status": "available" },
    "markdown-preview": { "status": "available" }
  },
  "private": true
}`;

/**
 * Convert a character position in a string to a line and column number.
 * @param {string} input
 * @param {number} position
 * @returns {{ line: number, column: number }}
 */
function positionToLineColumn(input, position) {
  const before = input.slice(0, position);
  const line = (before.match(/\n/g) ?? []).length + 1;
  const lastNewline = before.lastIndexOf('\n');
  const column = position - lastNewline;
  return { line, column };
}

/**
 * Adjust a character position to correct for V8 reporting the unexpected token
 * on the following line rather than the trailing character that caused the error.
 * When all characters from the start of the current line up to `pos` are
 * whitespace, the parser has crossed a line boundary — use the '\n' at the end
 * of the previous line so that line/column resolve to the actual error line.
 * @param {string} input
 * @param {number} pos
 * @returns {number}
 */
function adjustPosition(input, pos) {
  const lineStart = input.lastIndexOf('\n', pos - 1) + 1;
  if (/^\s*$/.test(input.slice(lineStart, pos))) {
    return Math.max(0, lineStart - 1);
  }
  return pos;
}

/**
 * Extract line and column info from a JSON SyntaxError.
 * Chrome: "at position N" or "at position N (line M column C)"
 * Firefox: "at line N column M"
 * @param {string} input
 * @param {Error} error
 * @returns {{ message: string, line: number | null, column: number | null }}
 */
function extractErrorInfo(input, error) {
  const msg = error.message;

  // Chrome v8 newer format: "at position N (line M column C)"
  // Recompute from position (ignoring V8's own line/col) so we can apply the
  // adjustPosition heuristic and point to the actual error line.
  const chromeDetailed = msg.match(/at position (\d+) \(line \d+ column \d+\)/);
  if (chromeDetailed) {
    const pos = parseInt(chromeDetailed[1], 10);
    const { line, column } = positionToLineColumn(input, adjustPosition(input, pos));
    return { message: msg, line, column };
  }

  // Chrome v8: "at position N"
  const chromeMatch = msg.match(/at position (\d+)/);
  if (chromeMatch) {
    const pos = parseInt(chromeMatch[1], 10);
    const { line, column } = positionToLineColumn(input, adjustPosition(input, pos));
    return { message: msg, line, column };
  }

  // Firefox: "at line N column M"
  const firefoxMatch = msg.match(/at line (\d+) column (\d+)/);
  if (firefoxMatch) {
    return {
      message: msg,
      line: parseInt(firefoxMatch[1], 10),
      column: parseInt(firefoxMatch[2], 10)
    };
  }

  return { message: msg, line: null, column: null };
}

/**
 * @typedef {Object} ParseSuccess
 * @property {true} success
 * @property {any} data
 * @property {string} formatted
 * @property {string} minified
 */

/**
 * @typedef {Object} ParseError
 * @property {false} success
 * @property {{ message: string, line: number | null, column: number | null }} error
 */

/**
 * Parse a JSON string and return either a success or error result.
 * @param {string} input
 * @returns {ParseSuccess | ParseError}
 */
export function parseJson(input) {
  try {
    const data = JSON.parse(input);
    return {
      success: true,
      data,
      formatted: JSON.stringify(data, null, 2),
      minified: JSON.stringify(data)
    };
  } catch (/** @type {any} */ e) {
    return {
      success: false,
      error: extractErrorInfo(input, e)
    };
  }
}

/**
 * @typedef {Object} JsonStats
 * @property {number} lines
 * @property {number} chars
 */

/**
 * Count lines and characters in a string.
 * @param {string} input
 * @returns {JsonStats}
 */
export function countJsonStats(input) {
  return {
    lines: input ? input.split('\n').length : 0,
    chars: input.length
  };
}

/** @param {string} str */
function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Return an HTML string with JSON keys, brackets, and braces wrapped in colored spans.
 * Uses a single-pass character-level tokenizer so structural characters inside string
 * values are never incorrectly highlighted. String content is HTML-escaped for XSS safety.
 * @param {string} formatted — output of JSON.stringify(data, null, 2)
 * @returns {string}
 */
export function highlightJson(formatted) {
  let result = '';
  let i = 0;
  const len = formatted.length;

  while (i < len) {
    const ch = formatted[i];

    if (ch === '"') {
      // Scan the full string token, respecting escape sequences
      let str = '"';
      i++;
      while (i < len) {
        const c = formatted[i];
        str += c;
        i++;
        if (c === '\\' && i < len) {
          str += formatted[i];
          i++;
        } else if (c === '"') {
          break;
        }
      }
      // Look ahead past spaces for ':' to identify keys
      let j = i;
      while (j < len && formatted[j] === ' ') j++;
      if (formatted[j] === ':') {
        result += `<span class="json-key">${escapeHtml(str)}</span>`;
      } else {
        result += escapeHtml(str);
      }
    } else if (ch === '[' || ch === ']') {
      result += `<span class="json-bracket">${ch}</span>`;
      i++;
    } else if (ch === '{' || ch === '}') {
      result += `<span class="json-brace">${ch}</span>`;
      i++;
    } else if (ch === '&') {
      result += '&amp;';
      i++;
    } else if (ch === '<') {
      result += '&lt;';
      i++;
    } else if (ch === '>') {
      result += '&gt;';
      i++;
    } else {
      result += ch;
      i++;
    }
  }

  return result;
}
