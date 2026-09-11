import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import JsonParser from './JsonParser.svelte';
import { ownerSessionId } from '$lib/popout-channel.js';

const TOOL = 'json-validator';
const SESSION_KEY = `dat-tools:popout-session:${TOOL}`;

/** @param {string} search */
function setSearch(search) {
  const url = new URL(location.href);
  url.search = search;
  history.replaceState(null, '', url.toString());
}

describe('JsonParser', () => {
  afterEach(() => {
    setSearch('');
    sessionStorage.removeItem(SESSION_KEY);
    vi.restoreAllMocks();
  });

  it('renders valid JSON as a tree', async () => {
    const screen = await render(JsonParser, { initialContent: '{"a": 1}' });
    await expect.element(screen.getByText('"a":', { exact: true })).toBeVisible();
    await screen.unmount();
  });

  it('shows an error list for invalid JSON', async () => {
    const screen = await render(JsonParser, { initialContent: '{ invalid' });
    await expect.element(screen.getByText('Invalid JSON', { exact: false })).toBeVisible();
    await screen.unmount();
  });

  it('formats, minifies, and clears the input', async () => {
    const screen = await render(JsonParser, { initialContent: '{"a":1}' });

    await screen.getByRole('button', { name: 'Format' }).click();
    await expect
      .element(screen.getByPlaceholder('Paste your JSON here...'))
      .toHaveValue('{\n  "a": 1\n}');

    await screen.getByRole('button', { name: 'Minify' }).click();
    await expect.element(screen.getByPlaceholder('Paste your JSON here...')).toHaveValue('{"a":1}');

    await screen.getByRole('button', { name: 'Clear' }).click();
    await expect.element(screen.getByPlaceholder('Paste your JSON here...')).toHaveValue('');

    await screen.unmount();
  });

  it('shows pop-out buttons for both panes', async () => {
    const screen = await render(JsonParser, { initialContent: '{}' });
    await expect
      .element(screen.getByRole('button', { name: 'Open Input in a new window' }))
      .toBeVisible();
    await expect
      .element(screen.getByRole('button', { name: 'Open Output in a new window' }))
      .toBeVisible();
    await screen.unmount();
  });

  it('does not call onsatellite when rendered normally (no popout request in the URL)', async () => {
    const onsatellite = vi.fn();
    const screen = await render(JsonParser, { initialContent: '', onsatellite });
    expect(onsatellite).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it('stays a normal full tool when opened directly with a popout URL but no owner ever answers', async () => {
    setSearch('?popout=output&session=orphan-session');
    const onsatellite = vi.fn();
    const screen = await render(JsonParser, { initialContent: '{"a": 1}', onsatellite });

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(onsatellite).not.toHaveBeenCalled();
    await expect.element(screen.getByText('"a":', { exact: true })).toBeVisible();
    await expect
      .element(screen.getByRole('button', { name: 'Open Input in a new window' }))
      .toBeVisible();
    await screen.unmount();
  });

  describe('pop-out', () => {
    it('does not hide a pane just from clicking pop-out when the popup is blocked', async () => {
      vi.spyOn(window, 'open').mockReturnValue(null);
      const screen = await render(JsonParser, { initialContent: '' });

      await screen.getByRole('button', { name: 'Open Output in a new window' }).click();

      await expect
        .element(screen.getByRole('button', { name: 'Open Output in a new window' }))
        .toBeVisible();
      await expect.element(screen.getByText('Pop-up blocked by the browser')).toBeVisible();
      await screen.unmount();
    });

    it('syncs typed input live to a satellite window rendering the Output pane', async () => {
      const owner = await render(JsonParser, { initialContent: '{"a": 1}' });

      const session = ownerSessionId(TOOL);
      setSearch(`?popout=output&session=${session}`);
      const satelliteOnsatellite = vi.fn();
      const satellite = await render(JsonParser, { onsatellite: satelliteOnsatellite });

      await expect.poll(() => satelliteOnsatellite.mock.calls).toEqual([[true, 'Output']]);
      await expect.element(satellite.getByText('Connected')).toBeVisible();
      await expect.element(owner.getByText('Output is open in another window')).toBeVisible();
      await expect.element(satellite.getByText('"a":', { exact: true })).toBeVisible();

      await owner.getByPlaceholder('Paste your JSON here...').fill('{"b": 2}');
      await expect.element(satellite.getByText('"b":', { exact: true })).toBeVisible();

      await owner.unmount();
      await satellite.unmount();
    });

    it('brings the pane home when the satellite returns', async () => {
      const owner = await render(JsonParser, { initialContent: '{"a": 1}' });

      const session = ownerSessionId(TOOL);
      setSearch(`?popout=output&session=${session}`);
      const satellite = await render(JsonParser);
      await expect.element(owner.getByText('Output is open in another window')).toBeVisible();

      await satellite.getByRole('button', { name: '↩ Return to main window' }).click();

      await expect
        .element(owner.getByRole('button', { name: 'Open Output in a new window' }))
        .toBeVisible();
      await expect
        .element(owner.getByText('Output is open in another window'))
        .not.toBeInTheDocument();

      await owner.unmount();
      await satellite.unmount();
    });

    it('disables Format/Minify/Sample/Clear in the owner while the input pane is popped out, and keeps them usable in the satellite', async () => {
      const owner = await render(JsonParser, { initialContent: '{"a":1}' });

      const session = ownerSessionId(TOOL);
      setSearch(`?popout=input&session=${session}`);
      const satellite = await render(JsonParser);
      await expect.element(owner.getByText('Input is open in another window')).toBeVisible();

      // Scoped via `.locator` (bound to this render's own container) rather than the plain
      // `getByRole` query (bound to `document.body`, shared by both instances in this test) - both
      // windows render the same `actions` snippet, so an unscoped query would be ambiguous.
      await expect.element(owner.locator.getByRole('button', { name: 'Clear' })).toBeDisabled();
      await expect.element(owner.locator.getByRole('button', { name: 'Format' })).toBeDisabled();

      // The bug this guards against: writing shared.input from the window that doesn't host the
      // editor pane would desync the two windows exactly like the Markdown Clear bug, since the
      // send effect only ever broadcasts from the window hosting the editor.
      await satellite.locator.getByRole('button', { name: 'Clear' }).click();
      await expect.element(satellite.getByPlaceholder('Paste your JSON here...')).toHaveValue('');
      await expect
        .element(owner.getByText('Paste JSON on the left', { exact: false }))
        .toBeVisible();

      await owner.unmount();
      await satellite.unmount();
    });

    it('keeps Copy enabled in both windows since it only reads shared input', async () => {
      const owner = await render(JsonParser, { initialContent: '{"a":1}' });

      const session = ownerSessionId(TOOL);
      setSearch(`?popout=input&session=${session}`);
      const satellite = await render(JsonParser);
      await expect.element(owner.getByText('Input is open in another window')).toBeVisible();

      await expect.element(owner.locator.getByRole('button', { name: 'Copy' })).toBeEnabled();
      await expect.element(satellite.locator.getByRole('button', { name: 'Copy' })).toBeEnabled();

      await owner.unmount();
      await satellite.unmount();
    });
  });
});
