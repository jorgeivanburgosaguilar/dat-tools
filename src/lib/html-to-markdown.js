import DOMPurify from 'dompurify';
import { tableToGrid, buildMarkdownTable } from './html-table-to-markdown.js';

const ALLOWED_TAGS = [
  'a',
  'abbr',
  'address',
  'article',
  'aside',
  'b',
  'blockquote',
  'br',
  'caption',
  'cite',
  'code',
  'col',
  'colgroup',
  'del',
  'details',
  'dd',
  'div',
  'dl',
  'dt',
  'em',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hgroup',
  'hr',
  'i',
  'img',
  'input',
  'kbd',
  'li',
  'main',
  'mark',
  'nav',
  'ol',
  'p',
  'pre',
  'q',
  'rp',
  'rt',
  'ruby',
  's',
  'samp',
  'section',
  'small',
  'span',
  'strike',
  'strong',
  'sub',
  'summary',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'time',
  'tr',
  'tt',
  'u',
  'ul',
  'var'
];

const ALLOWED_ATTR = [
  'alt',
  'checked',
  'class',
  'colspan',
  'href',
  'rowspan',
  'src',
  'start',
  'title',
  'type'
];

// Container elements with no markdown structure of their own: their children are walked as if
// they were direct children of the parent (fixes treating a stray <div> as an opaque leaf).
const TRANSPARENT_TAGS = new Set([
  'article',
  'aside',
  'div',
  'figure',
  'footer',
  'form',
  'header',
  'hgroup',
  'main',
  'nav',
  'section'
]);

const HEADING_RE = /^h[1-6]$/;

/**
 * Collapses noisy blank lines while retaining the one blank line Markdown needs between blocks.
 * A hard line break (`  \n`, two significant trailing spaces) is preserved rather than trimmed.
 * @param {string} markdown
 * @returns {string}
 */
function tidy(markdown) {
  return markdown
    .replace(/[ \t]+\n/g, (whitespace) => (whitespace === '  \n' ? whitespace : '\n'))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Escapes markdown-significant characters in plain text. Only ASCII punctuation with an
 * inline meaning is escaped (backslash itself, backtick, emphasis markers, brackets, and the
 * angle bracket that could start an autolink/raw tag) — see CommonMark §2.4: any ASCII
 * punctuation may be backslash-escaped and then carries no special meaning. Characters like
 * `&`, `(`, `)`, `.` and `!` are deliberately left alone so the inserted source stays readable.
 * @param {string} text
 * @returns {string}
 */
function escapeInline(text) {
  return text.replace(/[\\`*_[\]<]/g, '\\$&');
}

/**
 * Escapes markdown constructs that are only significant at the start of a line: headings,
 * blockquotes, tables, thematic breaks/setext underlines, and list markers. Applied per line so
 * a hard break (`  \n`) followed by e.g. "# " is escaped too, not just the paragraph's first line.
 * @param {string} text
 * @returns {string}
 */
function escapeLineStart(text) {
  return text.replace(/^(\s*)([#>|=~]|[-+*](?=\s)|\d+[.)](?=\s))/gm, '$1\\$2');
}

/**
 * Produces text safe to place inside a Markdown inline construct: whitespace collapsed to single
 * spaces, then markdown-escaped.
 * @param {string} text
 * @returns {string}
 */
function inlineText(text) {
  return escapeInline(text.replace(/\s+/g, ' '));
}

/**
 * Wraps `inner` in a backtick fence wide enough that it can't be closed early by a backtick run
 * already inside `inner`, padding with a space on each side when needed so the fence doesn't
 * merge with content that starts or ends with a backtick. Shared by inline code spans and
 * fenced code blocks.
 * @param {string} inner
 * @param {string} content
 * @returns {string}
 */
function backtickFence(inner, content) {
  const runs = content.match(/`+/g) ?? [];
  const width = Math.max(1, ...runs.map((r) => r.length + 1));
  const fence = '`'.repeat(width);
  const pad = content.startsWith('`') || content.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${inner}${pad}${fence}`;
}

/**
 * Converts a group of inline DOM nodes to Markdown.
 * @param {ChildNode[]} nodes
 * @returns {string}
 */
function inlineNodes(nodes) {
  let out = '';
  for (const child of nodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      out += inlineText(child.textContent ?? '');
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const element = /** @type {Element} */ (child);
    const tag = element.tagName.toLowerCase();

    // Skip a task-list checkbox itself; listMarkdown() reads it separately to pick the marker.
    if (tag === 'input') continue;

    const content = inlineMarkdown(element);
    const trimmed = content.trim();

    switch (tag) {
      case 'b':
      case 'strong':
        out += trimmed ? `**${trimmed}**` : '';
        break;
      case 'i':
      case 'em':
        out += trimmed ? `*${trimmed}*` : '';
        break;
      case 'del':
      case 's':
      case 'strike':
        out += trimmed ? `~~${trimmed}~~` : '';
        break;
      case 'code':
      case 'kbd':
      case 'samp':
      case 'var':
      case 'tt': {
        const raw = element.textContent ?? '';
        out += raw ? backtickFence(raw, raw) : '';
        break;
      }
      case 'a': {
        const href = element.getAttribute('href');
        const title = element.getAttribute('title');
        out += href ? `[${trimmed}](${href}${title ? ` "${title}"` : ''})` : content;
        break;
      }
      case 'img': {
        const src = element.getAttribute('src');
        const alt = element.getAttribute('alt') ?? '';
        const title = element.getAttribute('title');
        out += src ? `![${alt}](${src}${title ? ` "${title}"` : ''})` : '';
        break;
      }
      case 'br':
        out += '  \n';
        break;
      default:
        // sub/sup/mark/abbr/q/cite/span/small/u/time and anything else unrecognized: flatten to
        // plain inline text, per the "no markdown equivalent -> plain text" decision.
        out += content;
    }
  }
  return out;
}

/**
 * Converts an element's inline descendants to Markdown.
 * @param {Element} element
 * @returns {string}
 */
function inlineMarkdown(element) {
  return inlineNodes(Array.from(element.childNodes));
}

/**
 * True for elements that should end the current run of inline content and be handled as their
 * own block by blocks(). Everything else (text nodes and inline elements) is folded into an
 * implicit paragraph alongside its inline siblings.
 * @param {ChildNode} node
 * @returns {boolean}
 */
function isBlockNode(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  const tag = /** @type {Element} */ (node).tagName.toLowerCase();
  return (
    HEADING_RE.test(tag) ||
    TRANSPARENT_TAGS.has(tag) ||
    [
      'blockquote',
      'details',
      'dl',
      'figcaption',
      'hr',
      'ol',
      'p',
      'pre',
      'summary',
      'table',
      'ul'
    ].includes(tag)
  );
}

/**
 * Renders a run of inline sibling nodes (collected between block elements) as one paragraph.
 * @param {ChildNode[]} nodes
 * @returns {string}
 */
function paragraph(nodes) {
  const content = tidy(inlineNodes(nodes));
  return content ? escapeLineStart(content) : '';
}

/**
 * Converts a single block-level element to Markdown. Tables delegate to the existing,
 * separately-tested table converter (tableToGrid + buildMarkdownTable) so colspan/rowspan
 * expansion, column padding and cell escaping are exactly what "Import HTML Table" always
 * produced.
 * @param {Element} element
 * @returns {string}
 */
function blockFor(element) {
  const tag = element.tagName.toLowerCase();

  if (HEADING_RE.test(tag)) {
    const text = tidy(inlineMarkdown(element)).replace(/\s+/g, ' ');
    return text ? `${'#'.repeat(Number(tag[1]))} ${text}` : '';
  }
  if (tag === 'p' || tag === 'figcaption' || tag === 'address') {
    return paragraph(Array.from(element.childNodes));
  }
  if (tag === 'hr') {
    return '---';
  }
  if (tag === 'blockquote') {
    const body = tidy(blocks(element));
    if (!body) return '';
    return body
      .split('\n')
      .map((line) => (line ? `> ${line}` : '>'))
      .join('\n');
  }
  if (tag === 'pre') {
    const code = (element.textContent ?? '').replace(/^\n/, '').replace(/\n$/, '');
    const language = element
      .querySelector('code')
      ?.className.match(/(?:language|lang)-([\w-]+)/)?.[1];
    const width = Math.max(3, ...(code.match(/`+/g) ?? []).map((r) => r.length + 1));
    const fence = '`'.repeat(width);
    return `${fence}${language ?? ''}\n${code}\n${fence}`;
  }
  if (tag === 'ul' || tag === 'ol') {
    return listMarkdown(/** @type {HTMLOListElement | HTMLUListElement} */ (element));
  }
  if (tag === 'dl') {
    const parts = [];
    for (const child of Array.from(element.children)) {
      const childTag = child.tagName.toLowerCase();
      if (childTag === 'dt') {
        const term = tidy(inlineMarkdown(child));
        if (term) parts.push(`- **${term}**`);
      } else if (childTag === 'dd') {
        const def = tidy(inlineMarkdown(child));
        if (def) parts.push(`  ${def}`);
      }
    }
    return parts.join('\n');
  }
  if (tag === 'table') {
    const { header, rows } = tableToGrid(/** @type {HTMLTableElement} */ (element));
    return buildMarkdownTable(header, rows);
  }
  if (tag === 'details') {
    const summary = element.querySelector(':scope > summary');
    const summaryText = summary ? tidy(inlineMarkdown(summary)) : '';
    const rest = document.createDocumentFragment();
    for (const child of Array.from(element.childNodes)) {
      if (child !== summary) rest.appendChild(child.cloneNode(true));
    }
    const body = tidy(blocks(rest));
    const heading = summaryText ? `**${summaryText}**` : '';
    return [heading, body].filter(Boolean).join('\n\n');
  }
  if (TRANSPARENT_TAGS.has(tag)) {
    return blocks(element);
  }
  return blocks(element);
}

/**
 * Converts a list element, including nested lists, to Markdown list items. Continuation lines
 * and nested content indent by the marker's own width (2 under "- ", 3 under "1. ", 4 under
 * "10. ") — CommonMark requires nested content to align under the first non-space character
 * following the marker, not a fixed 2 spaces.
 * @param {HTMLOListElement | HTMLUListElement} list
 * @returns {string}
 */
function listMarkdown(list) {
  const ordered = list.tagName.toLowerCase() === 'ol';
  const start = ordered ? /** @type {HTMLOListElement} */ (list).start || 1 : 1;
  const items = Array.from(list.children).filter((child) => child.tagName.toLowerCase() === 'li');

  return items
    .map((item, index) => {
      const checkbox = item.querySelector(':scope > input[type="checkbox"]');
      const marker = checkbox
        ? `- [${checkbox.hasAttribute('checked') ? 'x' : ' '}] `
        : ordered
          ? `${start + index}. `
          : '- ';
      const body = tidy(blocks(item));
      const indent = ' '.repeat(marker.length);
      const indented = body
        .split('\n')
        .map((line, i) => (i === 0 ? line : line ? `${indent}${line}` : line))
        .join('\n');
      return `${marker}${indented}`;
    })
    .join('\n');
}

/**
 * Converts a node's block-level children to Markdown in document order, folding any run of
 * inline siblings (text nodes and inline elements with no block wrapper — e.g. a bare top-level
 * <strong> or the mixed content inside a <div>) into an implicit paragraph rather than losing
 * their formatting.
 * @param {Node} node
 * @returns {string}
 */
function blocks(node) {
  const out = [];
  /** @type {ChildNode[]} */
  let pending = [];

  const flushPending = () => {
    const md = paragraph(pending);
    if (md) out.push(md);
    pending = [];
  };

  for (const child of Array.from(node.childNodes)) {
    if (isBlockNode(child)) {
      flushPending();
      const md = blockFor(/** @type {Element} */ (child));
      if (md) out.push(md);
    } else {
      pending.push(child);
    }
  }
  flushPending();

  return out.join('\n\n');
}

/**
 * Converts sanitized HTML to Markdown. Unsafe tags and attributes are removed before traversal;
 * tables retain the existing specialized conversion behavior (tableToGrid + buildMarkdownTable),
 * so pasting a table-only fragment produces markdown identical to the old "Import HTML Table".
 * Elements with no markdown equivalent (e.g. <mark>, <abbr>, <span>) are flattened to their text.
 * @param {string} html
 * @returns {string}
 */
export function htmlToMarkdown(html) {
  if (!html || !html.trim()) throw new Error('Paste some HTML first.');
  if (!DOMPurify.isSupported)
    throw new Error('HTML sanitization is not available in this environment.');

  const fragment = /** @type {DocumentFragment} */ (
    DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR, RETURN_DOM_FRAGMENT: true })
  );
  const markdown = tidy(blocks(fragment));
  if (!markdown) {
    throw new Error('Nothing to convert — the pasted HTML had no readable content.');
  }
  return markdown;
}
