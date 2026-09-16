/**
 * DOM-level "find in page" style highlighting for already-rendered content (markdown output from
 * TrajectoryRichText, per-token syntax-highlighted spans from TrajectoryCodeBlock, plain metadata
 * rows, observation notices, step-list summaries, ...). Operates directly on rendered text nodes
 * rather than threading a query through every renderer that might contain matchable text, so one
 * call site covers all of them uniformly.
 *
 * Browser-only - callers are expected to invoke this from a Svelte `$effect`, which never runs
 * during SSR/prerendering.
 */

export const HIGHLIGHT_CLASS = 'trajectory-search-highlight';
const MARK_CLASS = HIGHLIGHT_CLASS;

// Elements whose contents form their own matching scope. A query is only ever matched *within*
// one of these (or within `root` itself, when no such ancestor exists) - never across one, since
// two of them are never rendered adjacent on the same visual line. This is what lets a match span
// several sibling text nodes (e.g. syntax-highlighted tokens: `<span>ls</span> <span>-la</span>`,
// or a bolded word butted up against plain text) without ever gluing together text from two
// unrelated rows/paragraphs/code lines that merely happen to be near each other in the DOM.
const BLOCK_TAGS = new Set([
  'DIV',
  'P',
  'LI',
  'DT',
  'DD',
  'DL',
  'TD',
  'TH',
  'TR',
  'THEAD',
  'TBODY',
  'TFOOT',
  'TABLE',
  'UL',
  'OL',
  'PRE',
  'CODE',
  'BLOCKQUOTE',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'SUMMARY',
  'DETAILS',
  'SECTION',
  'ARTICLE',
  'HEADER',
  'FOOTER',
  'FIGURE',
  'FIGCAPTION'
]);

/**
 * @param {Element} root
 */
function unwrapMarks(root) {
  const marks = root.querySelectorAll(`mark.${MARK_CLASS}`);
  for (const mark of marks) {
    const parent = mark.parentNode;
    if (!parent) continue;
    parent.replaceChild(document.createTextNode(mark.textContent ?? ''), mark);
    parent.normalize();
  }
}

/**
 * @param {Text} node
 * @param {Element} root
 * @returns {Element}
 */
function findBlockAncestor(node, root) {
  let el = node.parentElement;
  while (el && el !== root) {
    if (BLOCK_TAGS.has(el.tagName)) return el;
    el = el.parentElement;
  }
  return root;
}

/**
 * @param {Text} textNode
 * @param {string} text
 * @param {{ start: number, end: number, matchIndex: number }[]} intervals - Sorted, non-overlapping,
 *   local to `text`.
 */
function replaceNodeWithMarks(textNode, text, intervals) {
  const frag = document.createDocumentFragment();
  let cursor = 0;
  for (const { start, end, matchIndex } of intervals) {
    if (start > cursor) frag.appendChild(document.createTextNode(text.slice(cursor, start)));
    const mark = document.createElement('mark');
    mark.className = MARK_CLASS;
    mark.dataset.match = String(matchIndex);
    mark.textContent = text.slice(start, end);
    frag.appendChild(mark);
    cursor = end;
  }
  if (cursor < text.length) frag.appendChild(document.createTextNode(text.slice(cursor)));
  textNode.parentNode?.replaceChild(frag, textNode);
}

/**
 * Highlights every occurrence of `lowerQuery` within one matching scope's text nodes, treating
 * their concatenated text as a single searchable string so a match that straddles a node boundary
 * (a syntax-highlighter token split, an inline `<strong>`/`<code>` wrapper, ...) is still found.
 * @param {Text[]} textNodes - In document order.
 * @param {string} lowerQuery
 * @param {number} startIndex - First global match index to assign.
 * @returns {number} The next unused global match index.
 */
function highlightBlock(textNodes, lowerQuery, startIndex) {
  const values = textNodes.map((n) => n.nodeValue ?? '');
  const concatenated = values.join('');
  const lower = concatenated.toLowerCase();
  if (!lower.includes(lowerQuery)) return startIndex;

  /** @type {number[]} */
  const boundaries = [];
  let cursor = 0;
  for (const v of values) {
    boundaries.push(cursor);
    cursor += v.length;
  }

  /** @type {{ start: number, end: number, matchIndex: number }[]} */
  const matches = [];
  let matchIndex = startIndex;
  let idx = lower.indexOf(lowerQuery);
  while (idx !== -1) {
    matches.push({ start: idx, end: idx + lowerQuery.length, matchIndex: matchIndex++ });
    idx = lower.indexOf(lowerQuery, idx + lowerQuery.length);
  }

  textNodes.forEach((textNode, i) => {
    const nodeStart = boundaries[i];
    const nodeEnd = nodeStart + values[i].length;
    /** @type {{ start: number, end: number, matchIndex: number }[]} */
    const intervals = [];
    for (const m of matches) {
      const start = Math.max(m.start, nodeStart);
      const end = Math.min(m.end, nodeEnd);
      if (start < end) {
        intervals.push({
          start: start - nodeStart,
          end: end - nodeStart,
          matchIndex: m.matchIndex
        });
      }
    }
    if (intervals.length > 0) replaceNodeWithMarks(textNode, values[i], intervals);
  });

  return matchIndex;
}

/**
 * Re-highlights `root`'s text content for `query`: clears any previously-inserted highlight marks,
 * then (for a non-blank query) wraps every case-insensitive occurrence in one or more `<mark
 * class="trajectory-search-highlight">` elements, all sharing a `data-match` index per logical
 * occurrence (see `highlightBlock()` - a single occurrence can land in more than one `<mark>` when
 * it spans a node boundary). Always starts from a clean slate, so it's safe to call on every
 * relevant state change (selected step, query text, filters) without ever double-wrapping or
 * leaving marks from a stale query behind.
 * @param {Element | null | undefined} root
 * @param {string} query
 */
export function applyHighlight(root, query) {
  if (!root) return;
  unwrapMarks(root);
  const q = query.trim().toLowerCase();
  if (!q) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  /** @type {Map<Element, Text[]>} */
  const blocks = new Map();
  let node;
  while ((node = walker.nextNode())) {
    const textNode = /** @type {Text} */ (node);
    if (!textNode.nodeValue) continue;
    const block = findBlockAncestor(textNode, root);
    let list = blocks.get(block);
    if (!list) {
      list = [];
      blocks.set(block, list);
    }
    list.push(textNode);
  }

  let matchIndex = 0;
  for (const textNodes of blocks.values()) {
    matchIndex = highlightBlock(textNodes, q, matchIndex);
  }
}
