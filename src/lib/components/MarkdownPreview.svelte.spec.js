import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import MarkdownPreview from './MarkdownPreview.svelte';
import { ownerSessionId } from '$lib/popout-channel.js';

const TOOL = 'markdown-preview';
const SESSION_KEY = `dat-tools:popout-session:${TOOL}`;

/** @param {string} search */
function setSearch(search) {
  const url = new URL(location.href);
  url.search = search;
  history.replaceState(null, '', url.toString());
}

describe('MarkdownPreview', () => {
  afterEach(() => {
    setSearch('');
    sessionStorage.removeItem(SESSION_KEY);
    vi.restoreAllMocks();
  });

  it('renders both panes and shows the rendered markdown', async () => {
    const screen = render(MarkdownPreview, { initialContent: '# Hello' });
    await expect.element(screen.getByRole('heading', { name: 'Hello', level: 1 })).toBeVisible();
    await expect
      .element(screen.getByRole('button', { name: 'Open Markdown in a new window' }))
      .toBeVisible();
    await expect
      .element(screen.getByRole('button', { name: 'Open Preview in a new window' }))
      .toBeVisible();
    screen.unmount();
  });

  it('updates the preview as the markdown source changes', async () => {
    const screen = render(MarkdownPreview, { initialContent: '' });
    await screen.getByPlaceholder('Type your markdown here...').fill('## A heading');
    await expect
      .element(screen.getByRole('heading', { name: 'A heading', level: 2 }))
      .toBeVisible();
    screen.unmount();
  });

  it('clears the content', async () => {
    const screen = render(MarkdownPreview, { initialContent: '# Hello' });
    await screen.getByRole('button', { name: 'Clear' }).click();
    await expect.element(screen.getByPlaceholder('Type your markdown here...')).toHaveValue('');
    screen.unmount();
  });

  it('does not call onsatellite when rendered normally (no popout request in the URL)', async () => {
    const onsatellite = vi.fn();
    const screen = render(MarkdownPreview, { initialContent: '', onsatellite });
    expect(onsatellite).not.toHaveBeenCalled();
    screen.unmount();
  });

  it('stays a normal full tool when opened directly with a popout URL but no owner ever answers', async () => {
    setSearch('?popout=preview&session=orphan-session');
    const onsatellite = vi.fn();
    const screen = render(MarkdownPreview, { initialContent: '# Standalone', onsatellite });

    // Give any (incorrect) collapse a moment to happen before asserting it didn't.
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(onsatellite).not.toHaveBeenCalled();
    await expect
      .element(screen.getByRole('heading', { name: 'Standalone', level: 1 }))
      .toBeVisible();
    await expect
      .element(screen.getByRole('button', { name: 'Open Markdown in a new window' }))
      .toBeVisible();
    screen.unmount();
  });

  describe('pop-out', () => {
    it('does not hide a pane just from clicking pop-out when the popup is blocked', async () => {
      vi.spyOn(window, 'open').mockReturnValue(null);
      const screen = render(MarkdownPreview, { initialContent: '' });

      await screen.getByRole('button', { name: 'Open Preview in a new window' }).click();

      await expect
        .element(screen.getByRole('button', { name: 'Open Preview in a new window' }))
        .toBeVisible();
      await expect.element(screen.getByText('Pop-up blocked by the browser')).toBeVisible();
      screen.unmount();
    });

    it('syncs typed content live to a satellite window rendering the Preview pane', async () => {
      const owner = render(MarkdownPreview, { initialContent: '# Hello' });

      const session = ownerSessionId(TOOL);
      setSearch(`?popout=preview&session=${session}`);
      const satelliteOnsatellite = vi.fn();
      const satellite = render(MarkdownPreview, { onsatellite: satelliteOnsatellite });

      await expect.poll(() => satelliteOnsatellite.mock.calls).toEqual([[true, 'Preview']]);
      await expect.element(satellite.getByText('Connected')).toBeVisible();
      await expect.element(owner.getByText('Preview is open in another window')).toBeVisible();
      await expect
        .element(satellite.getByRole('heading', { name: 'Hello', level: 1 }))
        .toBeVisible();

      await owner.getByPlaceholder('Type your markdown here...').fill('## Synced heading');
      await expect
        .element(satellite.getByRole('heading', { name: 'Synced heading', level: 2 }))
        .toBeVisible();

      owner.unmount();
      satellite.unmount();
    });

    it('brings the pane home when the satellite returns', async () => {
      const owner = render(MarkdownPreview, { initialContent: '# Hello' });

      const session = ownerSessionId(TOOL);
      setSearch(`?popout=preview&session=${session}`);
      const satellite = render(MarkdownPreview);
      await expect.element(owner.getByText('Preview is open in another window')).toBeVisible();

      await satellite.getByRole('button', { name: '↩ Return to main window' }).click();

      await expect
        .element(owner.getByRole('button', { name: 'Open Preview in a new window' }))
        .toBeVisible();
      await expect
        .element(owner.getByText('Preview is open in another window'))
        .not.toBeInTheDocument();

      owner.unmount();
      satellite.unmount();
    });

    it('disables Import HTML Table in the owner while the editor pane is popped out', async () => {
      const owner = render(MarkdownPreview, { initialContent: '# Hello' });

      const session = ownerSessionId(TOOL);
      setSearch(`?popout=editor&session=${session}`);
      const satellite = render(MarkdownPreview);
      await expect.element(owner.getByText('Markdown is open in another window')).toBeVisible();

      // Scoped via `.locator` (bound to this render's own container) rather than the plain
      // `getByRole` query (bound to `document.body`, shared by both instances in this test) - the
      // satellite now renders the same `actions` snippet too, so an unscoped query would be
      // ambiguous between the two windows' buttons.
      const importButton = owner.locator.getByRole('button', { name: 'Import HTML Table' });
      await expect.element(importButton).toBeDisabled();

      owner.unmount();
      satellite.unmount();
    });

    it('disables Clear in the owner while the editor pane is popped out, and keeps it usable in the satellite', async () => {
      const owner = render(MarkdownPreview, { initialContent: '# Hello' });

      const session = ownerSessionId(TOOL);
      setSearch(`?popout=editor&session=${session}`);
      const satellite = render(MarkdownPreview);
      await expect.element(owner.getByText('Markdown is open in another window')).toBeVisible();

      // The bug this guards against: Clear used to write shared.markdown unconditionally, but the
      // send effect only broadcasts from the window hosting the editor - so clicking it here would
      // blank this window's preview while leaving the satellite's text untouched, silently
      // desyncing the two windows forever after. Scoped via `.locator` - see the comment on the
      // Import HTML Table test above for why an unscoped query would be ambiguous here.
      await expect.element(owner.locator.getByRole('button', { name: 'Clear' })).toBeDisabled();

      await satellite.locator.getByRole('button', { name: 'Clear' }).click();
      await expect
        .element(satellite.getByPlaceholder('Type your markdown here...'))
        .toHaveValue('');
      // The satellite's Clear synced back to shared.markdown, so the owner's preview (rendering
      // the same shared value) reflects it too - the two windows stay in agreement.
      await expect.element(owner.getByRole('heading', { name: 'Hello' })).not.toBeInTheDocument();

      owner.unmount();
      satellite.unmount();
    });
  });
});
