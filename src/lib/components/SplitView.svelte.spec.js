import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SplitViewHarness from './SplitViewHarness.svelte';

describe('SplitView', () => {
  it('renders both panes by default', async () => {
    const screen = await render(SplitViewHarness);
    await expect.element(screen.getByTestId('pane-first')).toBeVisible();
    await expect.element(screen.getByTestId('pane-second')).toBeVisible();
  });

  it('renders the actions and status snippets', async () => {
    const screen = await render(SplitViewHarness);
    await expect.element(screen.getByTestId('actions')).toBeVisible();
    await expect.element(screen.getByTestId('status')).toBeVisible();
  });

  describe('poppedId', () => {
    it('hides the first pane and expands the second when poppedId is "first"', async () => {
      const screen = await render(SplitViewHarness, { poppedId: 'first' });
      await expect.element(screen.getByTestId('pane-first')).not.toBeInTheDocument();
      await expect.element(screen.getByTestId('pane-second')).toBeVisible();
    });

    it('hides the second pane and expands the first when poppedId is "second"', async () => {
      const screen = await render(SplitViewHarness, { poppedId: 'second' });
      await expect.element(screen.getByTestId('pane-first')).toBeVisible();
      await expect.element(screen.getByTestId('pane-second')).not.toBeInTheDocument();
    });

    it('hides the view-mode segmented control while a pane is popped', async () => {
      const screen = await render(SplitViewHarness, { poppedId: 'second' });
      await expect.element(screen.getByRole('button', { name: 'Split' })).not.toBeInTheDocument();
    });

    it('shows a note naming which pane is open elsewhere', async () => {
      const screen = await render(SplitViewHarness, { poppedId: 'second' });
      await expect.element(screen.getByText('Preview is open in another window')).toBeVisible();
    });

    it('still renders the actions snippet while a pane is popped', async () => {
      const screen = await render(SplitViewHarness, { poppedId: 'second' });
      await expect.element(screen.getByTestId('actions')).toBeVisible();
    });
  });

  describe('restoring the previous view mode', () => {
    it('keeps the view mode chosen before a pop-out and restores it once poppedId clears', async () => {
      const screen = await render(SplitViewHarness);

      // Switch to Editor-only before anything is popped.
      await screen.getByRole('button', { name: 'Editor' }).click();
      await expect.element(screen.getByTestId('pane-first')).toBeVisible();
      await expect.element(screen.getByTestId('pane-second')).not.toBeInTheDocument();

      // Pop the second pane: still only the first shows (forced), and the segmented control is
      // hidden, so the earlier "Editor" choice can't be re-clicked - it just carries through.
      await screen.rerender({ poppedId: 'second' });
      await expect.element(screen.getByTestId('pane-first')).toBeVisible();
      await expect.element(screen.getByTestId('pane-second')).not.toBeInTheDocument();

      // Bring it back: the view mode from before the pop-out (Editor-only) is exactly what
      // reappears, proving it was derived rather than overwritten while popped.
      await screen.rerender({ poppedId: null });
      await expect.element(screen.getByTestId('pane-first')).toBeVisible();
      await expect.element(screen.getByTestId('pane-second')).not.toBeInTheDocument();
    });

    it('restores Split mode (both panes) after a pop-out if that was the prior mode', async () => {
      const screen = await render(SplitViewHarness);
      await expect.element(screen.getByTestId('pane-first')).toBeVisible();
      await expect.element(screen.getByTestId('pane-second')).toBeVisible();

      await screen.rerender({ poppedId: 'first' });
      await expect.element(screen.getByTestId('pane-first')).not.toBeInTheDocument();

      await screen.rerender({ poppedId: null });
      await expect.element(screen.getByTestId('pane-first')).toBeVisible();
      await expect.element(screen.getByTestId('pane-second')).toBeVisible();
    });
  });
});
