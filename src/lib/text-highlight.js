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

const MARK_CLASS = 'trajectory-search-highlight';

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
 * @param {Text} textNode
 * @param {string} lowerQuery
 */
function wrapMatchesInNode(textNode, lowerQuery) {
  const text = textNode.nodeValue ?? '';
  const lower = text.toLowerCase();
  let idx = lower.indexOf(lowerQuery);
  if (idx === -1) return;
  const frag = document.createDocumentFragment();
  let last = 0;
  while (idx !== -1) {
    if (idx > last) frag.appendChild(document.createTextNode(text.slice(last, idx)));
    const mark = document.createElement('mark');
    mark.className = MARK_CLASS;
    mark.textContent = text.slice(idx, idx + lowerQuery.length);
    frag.appendChild(mark);
    last = idx + lowerQuery.length;
    idx = lower.indexOf(lowerQuery, last);
  }
  if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
  textNode.parentNode?.replaceChild(frag, textNode);
}

/**
 * Re-highlights `root`'s text content for `query`: clears any previously-inserted highlight marks,
 * then (for a non-blank query) wraps every case-insensitive occurrence in a `<mark
 * class="trajectory-search-highlight">`. Always starts from a clean slate, so it's safe to call on
 * every relevant state change (selected step, query text, filters) without ever double-wrapping or
 * leaving marks from a stale query behind.
 * @param {Element | null | undefined} root
 * @param {string} query
 */
export function applyHighlight(root, query) {
  if (!root) return;
  unwrapMarks(root);
  const q = query.trim().toLowerCase();
  if (!q) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.nodeValue && node.nodeValue.toLowerCase().includes(q)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    }
  });
  /** @type {Text[]} */
  const targets = [];
  let node;
  while ((node = walker.nextNode())) targets.push(/** @type {Text} */ (node));
  for (const textNode of targets) wrapMatchesInNode(textNode, q);
}
