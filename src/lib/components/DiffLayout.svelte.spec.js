import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import DiffLayoutHarness from './DiffLayoutHarness.svelte';

/** @param {HTMLElement} container */
function paneOrder(container) {
  return Array.from(container.querySelectorAll('[data-testid^="pane-"]')).map(
    (el) => /** @type {HTMLElement} */ (el).dataset.testid
  );
}

describe('DiffLayout', () => {
  it('renders 2 panes in DOM order', async () => {
    const screen = await render(DiffLayoutHarness, { paneCount: 2 });
    expect(paneOrder(screen.container)).toEqual(['pane-a', 'pane-b']);
  });

  it('renders 3 panes in DOM order', async () => {
    const screen = await render(DiffLayoutHarness, { paneCount: 3 });
    expect(paneOrder(screen.container)).toEqual(['pane-a', 'pane-b', 'pane-c']);
  });

  it('renders the primary, actions and status snippets', async () => {
    const screen = await render(DiffLayoutHarness, { paneCount: 2 });
    await expect.element(screen.getByTestId('primary-btn')).toBeVisible();
    await expect.element(screen.getByTestId('actions')).toBeVisible();
    await expect.element(screen.getByTestId('status')).toBeVisible();
  });

  it('cycles a 2-pane layout through both orders on Swap', async () => {
    const screen = await render(DiffLayoutHarness, { paneCount: 2 });
    const swap = screen.getByRole('button', { name: '⇄ Swap' });

    expect(paneOrder(screen.container)).toEqual(['pane-a', 'pane-b']);
    await swap.click();
    expect(paneOrder(screen.container)).toEqual(['pane-b', 'pane-a']);
    await swap.click();
    expect(paneOrder(screen.container)).toEqual(['pane-a', 'pane-b']);
  });

  it('cycles a 3-pane layout source-first -> reversed -> source-in-the-middle on Swap', async () => {
    const screen = await render(DiffLayoutHarness, { paneCount: 3 });
    const swap = screen.getByRole('button', { name: '⇄ Swap' });

    expect(paneOrder(screen.container)).toEqual(['pane-a', 'pane-b', 'pane-c']);
    await swap.click();
    expect(paneOrder(screen.container)).toEqual(['pane-c', 'pane-b', 'pane-a']);
    await swap.click();
    expect(paneOrder(screen.container)).toEqual(['pane-b', 'pane-a', 'pane-c']);
    await swap.click();
    expect(paneOrder(screen.container)).toEqual(['pane-a', 'pane-b', 'pane-c']);
  });

  it('shows exactly one pane in focus mode and restores all panes on Split', async () => {
    const screen = await render(DiffLayoutHarness, { paneCount: 3 });

    await screen.getByRole('button', { name: 'B', exact: true }).click();
    expect(paneOrder(screen.container)).toEqual(['pane-b']);

    await screen.getByRole('button', { name: 'Split' }).click();
    expect(paneOrder(screen.container)).toEqual(['pane-a', 'pane-b', 'pane-c']);
  });

  describe('onpopout', () => {
    it('does not render pop-out buttons when onpopout is omitted', async () => {
      const screen = await render(DiffLayoutHarness, { paneCount: 2 });
      await expect
        .element(screen.getByRole('button', { name: /Open A in a new window/ }))
        .not.toBeInTheDocument();
    });

    it('renders one pop-out button per pane when onpopout is provided', async () => {
      const onpopout = vi.fn();
      const screen = await render(DiffLayoutHarness, { paneCount: 3, onpopout });
      await expect
        .element(screen.getByRole('button', { name: 'Open A in a new window' }))
        .toBeVisible();
      await expect
        .element(screen.getByRole('button', { name: 'Open B in a new window' }))
        .toBeVisible();
      await expect
        .element(screen.getByRole('button', { name: 'Open C in a new window' }))
        .toBeVisible();
    });

    it('calls onpopout with the clicked pane id', async () => {
      const onpopout = vi.fn();
      const screen = await render(DiffLayoutHarness, { paneCount: 2, onpopout });
      await screen.getByRole('button', { name: 'Open B in a new window' }).click();
      expect(onpopout).toHaveBeenCalledWith('b');
    });

    it('hides pop-out buttons once only one pane remains', async () => {
      const onpopout = vi.fn();
      const screen = await render(DiffLayoutHarness, { paneCount: 2, onpopout });
      await screen.getByRole('button', { name: 'Open B in a new window' }).click();

      // The harness doesn't remove panes on its own - simulate what the real parent does (filter
      // the popped pane out of `panes`) by re-rendering with a single-pane count.
      await screen.rerender({ paneCount: 1, onpopout });
      await expect
        .element(screen.getByRole('button', { name: /Open .* in a new window/ }))
        .not.toBeInTheDocument();
    });
  });
});
