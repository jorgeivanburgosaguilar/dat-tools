import { describe, it, expect, afterEach } from 'vitest';
import { applyHighlight } from './text-highlight.js';

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
});
