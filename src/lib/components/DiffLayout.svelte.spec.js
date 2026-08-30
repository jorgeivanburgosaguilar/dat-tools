import { describe, it, expect } from 'vitest';
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
    const screen = render(DiffLayoutHarness, { paneCount: 2 });
    expect(paneOrder(screen.container)).toEqual(['pane-a', 'pane-b']);
  });

  it('renders 3 panes in DOM order', async () => {
    const screen = render(DiffLayoutHarness, { paneCount: 3 });
    expect(paneOrder(screen.container)).toEqual(['pane-a', 'pane-b', 'pane-c']);
  });

  it('renders the primary, actions and status snippets', async () => {
    const screen = render(DiffLayoutHarness, { paneCount: 2 });
    await expect.element(screen.getByTestId('primary-btn')).toBeVisible();
    await expect.element(screen.getByTestId('actions')).toBeVisible();
    await expect.element(screen.getByTestId('status')).toBeVisible();
  });

  it('cycles a 2-pane layout through both orders on Swap', async () => {
    const screen = render(DiffLayoutHarness, { paneCount: 2 });
    const swap = screen.getByRole('button', { name: '⇄ Swap' });

    expect(paneOrder(screen.container)).toEqual(['pane-a', 'pane-b']);
    await swap.click();
    expect(paneOrder(screen.container)).toEqual(['pane-b', 'pane-a']);
    await swap.click();
    expect(paneOrder(screen.container)).toEqual(['pane-a', 'pane-b']);
  });

  it('cycles a 3-pane layout source-first -> reversed -> source-in-the-middle on Swap', async () => {
    const screen = render(DiffLayoutHarness, { paneCount: 3 });
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
    const screen = render(DiffLayoutHarness, { paneCount: 3 });

    await screen.getByRole('button', { name: 'B', exact: true }).click();
    expect(paneOrder(screen.container)).toEqual(['pane-b']);

    await screen.getByRole('button', { name: 'Split' }).click();
    expect(paneOrder(screen.container)).toEqual(['pane-a', 'pane-b', 'pane-c']);
  });
});
