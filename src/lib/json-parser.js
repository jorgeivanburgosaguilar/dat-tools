import { parse as jsoncParse } from 'jsonc-parser';

// Numeric values of jsonc-parser's ParseErrorCode const enum.
// Imported as plain numbers to avoid 'ambient const enum' errors with verbatimModuleSyntax.
const ParseErrorCode = /** @type {const} */ ({
  InvalidSymbol: 1,
  InvalidNumberFormat: 2,
  PropertyNameExpected: 3,
  ValueExpected: 4,
  ColonExpected: 5,
  CommaExpected: 6,
  CloseBraceExpected: 7,
  CloseBracketExpected: 8,
  EndOfFileExpected: 9,
  InvalidCommentToken: 10,
  InvalidCharacter: 16
});

/**
 * Convert a character offset in a string to a 1-based line and column.
 * @param {string} input
 * @param {number} offset
 * @returns {{ line: number, column: number }}
 */
function positionToLineColumn(input, offset) {
  const before = input.slice(0, offset);
  const line = (before.match(/\n/g) ?? []).length + 1;
  const lastNewline = before.lastIndexOf('\n');
  const column = offset - lastNewline;
  return { line, column };
}

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
 * Map a jsonc-parser ParseError to a human-friendly message.
 * @param {string} input
 * @param {{ error: number, offset: number, length: number }} e
 * @returns {string}
 */
function friendlyMessage(input, e) {
  const char = input[e.offset] ?? '';
  switch (e.error) {
    case ParseErrorCode.InvalidCommentToken:
      return 'JSON does not support comments — remove `//` or `/* */` comments';
    case ParseErrorCode.CloseBraceExpected:
      return 'Missing closing brace `}`';
    case ParseErrorCode.CloseBracketExpected:
      return 'Missing closing bracket `]`';
    case ParseErrorCode.ColonExpected:
      return 'Missing colon `:` after property name';
    case ParseErrorCode.CommaExpected:
      return 'Missing comma between values';
    case ParseErrorCode.PropertyNameExpected:
      if (char === '}' || char === ']')
        return `Trailing comma — remove the comma before \`${char}\``;
      if (char === "'") return 'Property names must use double quotes, not single quotes';
      return 'Property name expected';
    case ParseErrorCode.ValueExpected:
      if (char === '}' || char === ']')
        return `Trailing comma — remove the comma before \`${char}\``;
      return 'Syntax error — value expected';
    case ParseErrorCode.InvalidSymbol:
      if (char === "'") return 'Strings must use double quotes, not single quotes';
      return `Invalid character \`${char}\``;
    case ParseErrorCode.InvalidCharacter:
      if (char === "'") return 'Strings must use double quotes, not single quotes';
      return `Invalid character \`${char}\``;
    case ParseErrorCode.EndOfFileExpected:
      return 'Unexpected content after end of JSON — a document must have exactly one root value';
    case ParseErrorCode.InvalidNumberFormat:
      return 'Invalid number format';
    default:
      return 'Syntax error';
  }
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
 * @property {Array<{ message: string, line: number | null, column: number | null }>} errors
 */

/**
 * Parse a JSON string and return either a success or error result.
 * @param {string} input
 * @returns {ParseSuccess | ParseError}
 */
export function parseJson(input) {
  if (!input.trim()) {
    return {
      success: false,
      errors: [{ message: 'Enter a JSON value', line: null, column: null }]
    };
  }
  /** @type {Array<{ error: number, offset: number, length: number }>} */
  const parseErrors = [];
  const data = jsoncParse(input, parseErrors, {
    allowTrailingComma: false,
    allowEmptyContent: false,
    disallowComments: true
  });
  if (parseErrors.length === 0) {
    return {
      success: true,
      data,
      formatted: JSON.stringify(data, null, 2),
      minified: JSON.stringify(data)
    };
  }
  const errors = parseErrors.slice(0, 10).map((e) => {
    const { line, column } = positionToLineColumn(input, e.offset);
    return { message: friendlyMessage(input, e), line, column };
  });
  return { success: false, errors };
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
