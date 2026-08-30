import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import DiffChecker from './DiffChecker.svelte';
import { DEFAULT_ORIGINAL, DEFAULT_CHANGED } from '$lib/text-diff.js';

describe('DiffChecker', () => {
  it('renders two textareas in edit mode with an Original/Changed segmented control', async () => {
    const screen = render(DiffChecker, { initialOriginal: 'a', initialChanged: 'b' });
    expect(screen.container.querySelectorAll('textarea')).toHaveLength(2);
    await expect.element(screen.getByRole('button', { name: 'Original' })).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Changed' })).toBeVisible();
  });

  it('switches to a read-only diff view on Diff and back to editing on Edit', async () => {
    const screen = render(DiffChecker, {
      initialOriginal: 'alpha\nbeta',
      initialChanged: 'alpha\ngamma'
    });
    await screen.getByRole('button', { name: 'Diff' }).click();
    expect(screen.container.querySelectorAll('textarea')).toHaveLength(0);
    await expect.element(screen.getByText('beta')).toBeVisible();
    await expect.element(screen.getByText('gamma')).toBeVisible();

    await screen.getByRole('button', { name: 'Edit' }).click();
    const textareas = screen.container.querySelectorAll('textarea');
    expect(textareas).toHaveLength(2);
    expect(/** @type {HTMLTextAreaElement} */ (textareas[0]).value).toBe('alpha\nbeta');
    expect(/** @type {HTMLTextAreaElement} */ (textareas[1]).value).toBe('alpha\ngamma');
  });

  it('renders the same number of rows in both panes', async () => {
    const screen = render(DiffChecker, {
      initialOriginal: 'a\nb\nc',
      initialChanged: 'a\nX\nc\nd'
    });
    await screen.getByRole('button', { name: 'Diff' }).click();
    const left = screen.container.querySelector('[data-pane="Original"]');
    const right = screen.container.querySelector('[data-pane="Changed"]');
    const leftRows = left?.querySelectorAll('.h-5') ?? [];
    const rightRows = right?.querySelectorAll('.h-5') ?? [];
    expect(leftRows.length).toBeGreaterThan(0);
    expect(leftRows.length).toBe(rightRows.length);
  });

  it('shows an identical-texts status for two equal inputs', async () => {
    const screen = render(DiffChecker, {
      initialOriginal: 'same\ntext',
      initialChanged: 'same\ntext'
    });
    await screen.getByRole('button', { name: 'Diff' }).click();
    await expect.element(screen.getByText('Texts are identical.')).toBeVisible();
  });

  it('marks a single added space with a diff-char-added element', async () => {
    const screen = render(DiffChecker, {
      initialOriginal: 'alpha beta',
      initialChanged: 'alpha  beta'
    });
    await screen.getByRole('button', { name: 'Diff' }).click();
    const added = screen.container.querySelector('.diff-char-added');
    expect(added).not.toBeNull();
    expect(added?.textContent).toBe(' ');
  });

  it('toggles whitespace glyphs on and off', async () => {
    const screen = render(DiffChecker, {
      initialOriginal: 'alpha beta',
      initialChanged: 'alpha  beta'
    });
    await screen.getByRole('button', { name: 'Diff' }).click();

    // Scope to the diff panes: the status bar itself uses "·" as a stat separator.
    const panesText = () =>
      Array.from(screen.container.querySelectorAll('[data-pane]'))
        .map((el) => el.textContent ?? '')
        .join('');

    const toggle = screen.getByRole('button', { name: 'Show whitespace' });
    await expect.element(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(panesText().includes('·')).toBe(false);

    await toggle.click();
    await expect.element(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(panesText().includes('·')).toBe(true);

    await toggle.click();
    await expect.element(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(panesText().includes('·')).toBe(false);
  });

  it('renders hljs- classed spans after picking JavaScript', async () => {
    const screen = render(DiffChecker, {
      initialOriginal: 'const a = 1;',
      initialChanged: 'const a = 2;'
    });
    await screen.getByRole('button', { name: 'Diff' }).click();
    const select = screen.container.querySelector('select');
    expect(select).not.toBeNull();
    /** @type {HTMLSelectElement} */ (select).value = 'javascript';
    select?.dispatchEvent(new Event('change', { bubbles: true }));

    await expect
      .poll(() => screen.container.querySelector('[class*="hljs-"]') !== null, { timeout: 5000 })
      .toBe(true);
  });

  it('locks vertical scroll between the two panes', async () => {
    // This is a Tailwind-driven browser test with no CSS pipeline attached (component-only
    // render, no app.css), so the panes' real flex/overflow layout never engages here - that
    // full-stack behavior is covered by the manual verification pass against the live page.
    // What's tested here is the scroll-lock wiring itself: force a genuine scrollable region
    // with inline styles, then confirm the $effect in each DiffPane actually mirrors scrollTop.
    const many = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n');
    const screen = render(DiffChecker, { initialOriginal: many, initialChanged: many + '\nextra' });
    await screen.getByRole('button', { name: 'Diff' }).click();

    const left = /** @type {HTMLElement} */ (
      screen.container.querySelector('[data-pane="Original"] .overflow-auto')
    );
    const right = /** @type {HTMLElement} */ (
      screen.container.querySelector('[data-pane="Changed"] .overflow-auto')
    );
    expect(left).not.toBeNull();
    expect(right).not.toBeNull();
    left.style.cssText = 'height: 100px; overflow: auto; display: block;';
    right.style.cssText = 'height: 100px; overflow: auto; display: block;';

    left.scrollTop = 100;
    left.dispatchEvent(new Event('scroll', { bubbles: true }));

    await expect.poll(() => right.scrollTop, { timeout: 3000 }).toBe(100);
  });

  it('loads sample content, swaps panes, and clears back to edit mode', async () => {
    const screen = render(DiffChecker, { initialOriginal: 'x', initialChanged: 'y' });

    await screen.getByRole('button', { name: 'Sample' }).click();
    let textareas = screen.container.querySelectorAll('textarea');
    expect(/** @type {HTMLTextAreaElement} */ (textareas[0]).value).toBe(DEFAULT_ORIGINAL);
    expect(/** @type {HTMLTextAreaElement} */ (textareas[1]).value).toBe(DEFAULT_CHANGED);

    await screen.getByRole('button', { name: 'Swap texts' }).click();
    textareas = screen.container.querySelectorAll('textarea');
    expect(/** @type {HTMLTextAreaElement} */ (textareas[0]).value).toBe(DEFAULT_CHANGED);
    expect(/** @type {HTMLTextAreaElement} */ (textareas[1]).value).toBe(DEFAULT_ORIGINAL);

    await screen.getByRole('button', { name: 'Clear' }).click();
    textareas = screen.container.querySelectorAll('textarea');
    expect(/** @type {HTMLTextAreaElement} */ (textareas[0]).value).toBe('');
    expect(/** @type {HTMLTextAreaElement} */ (textareas[1]).value).toBe('');
  });

  it('disables the Diff button when both panes are empty', async () => {
    const screen = render(DiffChecker, { initialOriginal: '', initialChanged: '' });
    await expect.element(screen.getByRole('button', { name: 'Diff' })).toBeDisabled();
  });
});
