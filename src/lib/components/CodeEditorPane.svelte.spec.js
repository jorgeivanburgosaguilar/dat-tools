import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import CodeEditorPane from './CodeEditorPane.svelte';

describe('CodeEditorPane', () => {
  it('reserves extra gutter row height for a wrapped long line, restored to uniform rows when Wrap is off', async () => {
    // No Tailwind CSS pipeline is attached to a component-only render (see the note on
    // DiffChecker.svelte.spec.js's "locks vertical scroll" test), so `whitespace-pre-wrap` /
    // `font-mono` / `leading-5` have no real effect here. What still works without any stylesheet:
    // a <div>'s default `white-space: normal` already wraps plain text at a constrained width, and
    // `ResizeObserver` reacts to real layout size regardless of what set it - so forcing a narrow
    // inline-style width on the textarea is enough to exercise the component's own measurement
    // logic (mirror sizing, ResizeObserver, toRowSpans) against genuine wrapped/unwrapped heights.
    const long = Array.from({ length: 40 }, () => 'lorem').join(' ');
    const value = `${long}\nshort`;

    const screen = render(CodeEditorPane, { label: 'Test', value });
    const textarea = /** @type {HTMLTextAreaElement} */ (
      screen.container.querySelector('textarea')
    );
    textarea.style.cssText = 'display: block; width: 120px;';

    const rowHeight = (/** @type {number} */ i) => {
      const rows = screen.container.querySelectorAll('[data-gutter-row]');
      const row = /** @type {HTMLElement | undefined} */ (rows[i]);
      return row ? parseFloat(row.style.height || '0') : 0;
    };

    // The wrapped long first line should measure taller than the short, unwrapped second line.
    await expect
      .poll(() => rowHeight(0) > rowHeight(1) && rowHeight(1) > 0, { timeout: 3000 })
      .toBe(true);

    await screen.getByRole('button', { name: 'Wrap' }).click();

    // With wrap off, the component stops writing a per-row height override on the gutter at all.
    await expect
      .poll(() => {
        const rows = screen.container.querySelectorAll('[data-gutter-row]');
        return Array.from(rows).every(
          (row) => /** @type {HTMLElement} */ (row).style.height === ''
        );
      })
      .toBe(true);
  });
});
