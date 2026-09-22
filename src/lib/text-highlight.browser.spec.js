import { describe, it, expect, afterEach } from 'vitest';
import { applyHighlight, clearHighlight } from './text-highlight.js';

describe('text-highlight', () => {
  /** @type {HTMLElement[]} */
  const mounted = [];

  /** @param {string} html */
  function mount(html) {
    const el = document.createElement('div');
    el.innerHTML = html;
    document.body.appendChild(el);
    mounted.push(el);
    return el;
  }

  afterEach(() => {
    for (const el of mounted.splice(0)) el.remove();
  });

  it('wraps every case-insensitive occurrence in a <mark>', () => {
    const root = mount('<p>The Cat sat with the cat and a caterpillar.</p>');
    applyHighlight(root, 'cat');
    // "Cat", "cat" (in "the cat and"), and the "cat" prefix of "caterpillar" - 3 occurrences.
    const marks = root.querySelectorAll('mark.trajectory-search-highlight');
    expect(marks).toHaveLength(3);
    for (const mark of marks) expect(mark.textContent?.toLowerCase()).toBe('cat');
    expect(root.textContent).toBe('The Cat sat with the cat and a caterpillar.');
  });

  it('matches across nested elements independently per text node', () => {
    const root = mount('<div>outer <span>inner keyword</span> tail keyword end</div>');
    applyHighlight(root, 'keyword');
    const marks = root.querySelectorAll('mark.trajectory-search-highlight');
    expect(marks).toHaveLength(2);
  });

  it('does nothing for a blank query beyond clearing prior marks', () => {
    const root = mount('<p>find this word</p>');
    applyHighlight(root, 'word');
    expect(root.querySelectorAll('mark.trajectory-search-highlight')).toHaveLength(1);
    applyHighlight(root, '   ');
    expect(root.querySelectorAll('mark.trajectory-search-highlight')).toHaveLength(0);
    expect(root.textContent).toBe('find this word');
  });

  it('re-highlighting for a new query clears marks from the previous one', () => {
    const root = mount('<p>alpha beta gamma</p>');
    applyHighlight(root, 'alpha');
    expect(root.querySelectorAll('mark.trajectory-search-highlight')).toHaveLength(1);
    applyHighlight(root, 'gamma');
    const marks = root.querySelectorAll('mark.trajectory-search-highlight');
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe('gamma');
    expect(root.textContent).toBe('alpha beta gamma');
  });

  it('is a no-op when the root is null or undefined', () => {
    expect(() => applyHighlight(null, 'x')).not.toThrow();
    expect(() => applyHighlight(undefined, 'x')).not.toThrow();
  });

  it('finds a match split across sibling elements by a syntax highlighter (same block)', () => {
    // Mirrors TrajectoryCodeBlock.svelte's per-line markup: a bash tokenizer commonly puts the
    // command and its flag in separate <span> runs, so "ls -la" never appears whole in any single
    // text node - only in their shared line <div>'s concatenated text.
    const root = mount('<div><span>ls</span> <span class="hljs-flag">-la</span></div>');
    applyHighlight(root, 'ls -la');
    const marks = root.querySelectorAll('mark.trajectory-search-highlight');
    // One <mark> per DOM text node the match touches: "ls", the space between the two <span>s,
    // and "-la" - all three sharing one `data-match` index (see assertion below).
    expect(marks).toHaveLength(3);
    expect(Array.from(marks, (m) => m.textContent).join('')).toBe('ls -la');
    const matchIds = new Set(Array.from(marks, (m) => m.getAttribute('data-match')));
    expect(matchIds.size).toBe(1);
    expect(root.textContent).toBe('ls -la');
  });

  it('does not merge text across separate block-level elements', () => {
    const root = mount('<p>end of para one</p><p>start of para two</p>');
    applyHighlight(root, 'one start');
    expect(root.querySelectorAll('mark.trajectory-search-highlight')).toHaveLength(0);
  });

  it('assigns increasing data-match indices across multiple blocks in document order', () => {
    const root = mount('<p>alpha keyword</p><p>keyword beta</p>');
    applyHighlight(root, 'keyword');
    const marks = root.querySelectorAll('mark.trajectory-search-highlight');
    expect(marks).toHaveLength(2);
    expect(marks[0].getAttribute('data-match')).toBe('0');
    expect(marks[1].getAttribute('data-match')).toBe('1');
  });

  // Regression test for a bug where a framework (Svelte) holding a direct reference to a rendered
  // text node - for plain text bindings, or as a block anchor - would silently stop updating the
  // DOM after a search ran once. Cause: unwrapping used to fabricate a *new* text node (and call
  // `Node.normalize()`), permanently detaching the node the framework still thought was live. The
  // fix restores the exact original node object on unwrap, so identity survives a highlight/clear
  // cycle and any later write to `nodeValue` (as a framework's own re-render would perform) is
  // still visible once restored.
  it('restores the original text node object (identity) when clearing highlights', () => {
    const root = mount('<p>Step one keyword here</p>');
    const original = /** @type {Text} */ (Array.from(root.querySelectorAll('p'))[0].firstChild);
    expect(original.nodeType).toBe(Node.TEXT_NODE);

    applyHighlight(root, 'keyword');
    expect(root.querySelectorAll('mark.trajectory-search-highlight')).toHaveLength(1);
    // The original node is detached (still exists as an object, but no longer in the document)
    // while marks are present.
    expect(root.contains(original)).toBe(false);

    clearHighlight(root);
    expect(root.querySelectorAll('mark.trajectory-search-highlight')).toHaveLength(0);
    // Same node object is back in the document, not a lookalike replacement.
    expect(root.contains(original)).toBe(true);
    expect(root.querySelector('p')?.firstChild).toBe(original);
  });

  it('surfaces a nodeValue written while the node was detached, once restored', () => {
    // Simulates a framework fully re-rendering the text on a node it still holds a reference to
    // (as a plain `{expression}` text binding does), while that node happens to be sitting inside
    // a highlight mark. The whole original node - not just a fragment of it - is what comes back
    // on `clearHighlight()`, so the framework's write to the complete string is what's visible.
    const root = mount('<p>Step one keyword here</p>');
    const original = /** @type {Text} */ (Array.from(root.querySelectorAll('p'))[0].firstChild);

    applyHighlight(root, 'keyword');
    original.nodeValue = 'Step two, different content entirely';
    clearHighlight(root);

    expect(root.querySelector('p')?.textContent).toBe('Step two, different content entirely');
  });
});
