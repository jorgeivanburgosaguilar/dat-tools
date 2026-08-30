import DOMPurify from 'dompurify';

/** @typedef {{ markdown: string, tableCount: number }} ConversionResult */
/** @typedef {{ header: string[] | null, rows: string[][] }} TableGrid */

const ALLOWED_TAGS = [
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'caption',
  'colgroup',
  'col',
  'b',
  'strong',
  'i',
  'em',
  'code',
  'kbd',
  'a',
  'br',
  'p',
  'div',
  'span',
  'ul',
  'ol',
  'li',
  'del',
  's',
  'sup',
  'sub',
  'img'
];

const ALLOWED_ATTR = ['colspan', 'rowspan', 'href', 'src', 'alt', 'title'];

/**
 * Sanitizes raw HTML and returns it as a detached, parsed DocumentFragment. The fragment is
 * never inserted into the live document and never passed to `{@html}` — it is only read
 * (textContent / childNodes) while building the markdown table.
 * @param {string} html
 * @returns {DocumentFragment}
 */
export function sanitizeTableHtml(html) {
  if (!DOMPurify.isSupported) {
    throw new Error('HTML sanitization is not available in this environment.');
  }
  return /** @type {DocumentFragment} */ (
    DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR, RETURN_DOM_FRAGMENT: true })
  );
}

/**
 * Escapes markdown-significant characters in plain text destined for a table cell.
 * @param {string} text
 * @returns {string}
 */
function escapeCellText(text) {
  return text.replace(/\|/g, '\\|');
}

/**
 * Collapses runs of whitespace (including newlines) into single spaces and trims the ends.
 * @param {string} text
 * @returns {string}
 */
function collapseWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Recursively converts a table cell's child nodes into an inline markdown string.
 * @param {Node} node
 * @returns {string}
 */
function inlineToMarkdown(node) {
  let out = '';
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      out += escapeCellText(child.textContent ?? '');
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const el = /** @type {Element} */ (child);
    const tag = el.tagName.toLowerCase();
    const inner = inlineToMarkdown(el);
    const trimmedInner = inner.trim();

    switch (tag) {
      case 'strong':
      case 'b':
        out += trimmedInner ? `**${inner}**` : inner;
        break;
      case 'em':
      case 'i':
        out += trimmedInner ? `*${inner}*` : inner;
        break;
      case 'del':
      case 's':
        out += trimmedInner ? `~~${inner}~~` : inner;
        break;
      case 'code':
      case 'kbd':
        out += trimmedInner ? `\`${el.textContent ?? ''}\`` : inner;
        break;
      case 'a': {
        const href = el.getAttribute('href');
        out += href ? `[${inner}](${href})` : inner;
        break;
      }
      case 'img': {
        const src = el.getAttribute('src') ?? '';
        const alt = el.getAttribute('alt') ?? '';
        out += src ? `![${alt}](${src})` : '';
        break;
      }
      case 'br':
        out += '<br>';
        break;
      case 'p':
      case 'div':
      case 'li': {
        const sep = out && !out.endsWith('<br>') ? '<br>' : '';
        out += sep + inner;
        break;
      }
      default:
        out += inner;
    }
  }
  return out;
}

/**
 * Converts a single table cell element to its markdown cell content.
 * @param {Element} cellEl
 * @returns {string}
 */
export function cellToMarkdown(cellEl) {
  return collapseWhitespace(inlineToMarkdown(cellEl));
}

/**
 * Walks an HTMLTableElement into a header row (or null) plus a rectangular body grid,
 * expanding colspan/rowspan into repeated/reserved cells. Nested tables are not traversed
 * (HTMLTableElement.rows only ever reflects that table's own thead/tbody/tfoot rows).
 * @param {HTMLTableElement} tableEl
 * @returns {TableGrid}
 */
export function tableToGrid(tableEl) {
  const rows = Array.from(tableEl.rows);
  if (rows.length === 0) return { header: null, rows: [] };

  /** @type {Map<number, { text: string, remaining: number }>} column -> carried-over rowspan cell */
  const occupancy = new Map();
  /** @type {string[][]} */
  const grid = [];

  for (const row of rows) {
    /** @type {string[]} */
    const gridRow = [];

    // Carry forward cells still covered by a rowspan from a previous row, and decay them.
    // This must happen before this row's own cells are placed, and must not touch entries
    // created below for *this* row — otherwise a rowspan would be released one row early.
    for (const [col, span] of occupancy) {
      gridRow[col] = span.text;
      span.remaining -= 1;
      if (span.remaining <= 0) occupancy.delete(col);
    }

    let col = 0;
    for (const cell of Array.from(row.cells)) {
      while (gridRow[col] !== undefined) col++;
      const colspan = Math.max(1, cell.colSpan || 1);
      const rowspan = Math.max(1, cell.rowSpan || 1);
      const text = cellToMarkdown(cell);

      for (let i = 0; i < colspan; i++) {
        const c = col + i;
        gridRow[c] = text;
        if (rowspan > 1) occupancy.set(c, { text, remaining: rowspan - 1 });
      }
      col += colspan;
    }

    grid.push(gridRow);
  }

  const hasThead = tableEl.tHead && tableEl.tHead.rows.length > 0;
  const firstRowHasTh = rows[0] && rows[0].querySelector('th') !== null;

  if (hasThead) {
    const headerRowCount = /** @type {HTMLTableSectionElement} */ (tableEl.tHead).rows.length;
    return {
      header: grid[0].map((c) => c ?? ''),
      rows: grid.slice(headerRowCount)
    };
  }
  if (firstRowHasTh) {
    return { header: grid[0].map((c) => c ?? ''), rows: grid.slice(1) };
  }
  return { header: null, rows: grid.map((r) => r.map((c) => c ?? '')) };
}

/**
 * Builds a GFM markdown table string from a header row and body rows. Pure — no DOM access.
 * All rows (including the header) are padded to the widest row's length, and every column is
 * padded to its widest cell so the source lines up — matching the style of a hand-written or
 * prettier-formatted markdown table. When `header` is null, an empty header row is emitted
 * since most markdown renderers require one.
 * @param {string[] | null} header
 * @param {string[][]} rows
 * @returns {string}
 */
export function buildMarkdownTable(header, rows) {
  const width = Math.max(header?.length ?? 0, ...rows.map((r) => r.length), 0);
  if (width === 0 || rows.length === 0) return '';

  const pad = (/** @type {string[]} */ r) => Array.from({ length: width }, (_, i) => r[i] ?? '');
  const headerRow = pad(header ?? []);
  const bodyRows = rows.map(pad);
  const allRows = [headerRow, ...bodyRows];

  // 3-char floor so the divider always has room for `---`, as GFM requires.
  const colWidths = Array.from({ length: width }, (_, i) =>
    Math.max(3, ...allRows.map((r) => r[i].length))
  );
  const toLine = (/** @type {string[]} */ r) =>
    `| ${r.map((c, i) => c.padEnd(colWidths[i])).join(' | ')} |`;

  const headerLine = toLine(headerRow);
  const dividerLine = `| ${colWidths.map((w) => '-'.repeat(w)).join(' | ')} |`;
  const bodyLines = bodyRows.map(toLine);

  return [headerLine, dividerLine, ...bodyLines].join('\n');
}

/**
 * Converts every top-level `<table>` found in `html` (nested tables are left embedded in
 * their parent cell's text, matching how a browser copy/paste would flatten them) into a
 * GFM markdown table. The input is sanitized with DOMPurify before any parsing.
 * @param {string} html
 * @returns {ConversionResult}
 */
export function htmlTableToMarkdown(html) {
  if (!html || !html.trim()) {
    throw new Error('Paste some HTML first.');
  }

  const fragment = sanitizeTableHtml(html);
  const allTables = Array.from(fragment.querySelectorAll('table'));
  const topLevelTables = allTables.filter((t) => t.parentElement?.closest('table') == null);

  if (topLevelTables.length === 0) {
    throw new Error('No <table> found in the pasted HTML.');
  }

  const markdown = topLevelTables
    .map((t) => {
      const { header, rows } = tableToGrid(/** @type {HTMLTableElement} */ (t));
      return buildMarkdownTable(header, rows);
    })
    .filter((s) => s !== '')
    .join('\n\n');

  return { markdown, tableCount: topLevelTables.length };
}
