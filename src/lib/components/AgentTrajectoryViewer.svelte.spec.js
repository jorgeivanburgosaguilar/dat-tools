import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import AgentTrajectoryViewer from './AgentTrajectoryViewer.svelte';
import { ownerSessionId } from '$lib/popout-channel.js';

const TOOL = 'agent-trajectory-viewer';
const SESSION_KEY = `dat-tools:popout-session:${TOOL}`;

/** @param {string} search */
function setSearch(search) {
  const url = new URL(location.href);
  url.search = search;
  history.replaceState(null, '', url.toString());
}

/** @param {ReturnType<typeof render>} screen */
async function loadExample(screen) {
  await screen.getByRole('button', { name: 'Load example' }).click();
  await expect.poll(() => screen.container.querySelectorAll('[data-step-index]').length).toBe(6);
}

describe('AgentTrajectoryViewer', () => {
  // Every render creates a real BroadcastChannel bridge (createOwnerSync runs unconditionally
  // from onMount) - left unmounted and un-reset, later tests' owner instances would keep sharing
  // both the channel and the sessionStorage-backed session id with every earlier test's still-live
  // instance, so a pop-out test added here would receive replies from multiple stale "owners".
  afterEach(() => {
    setSearch('');
    sessionStorage.removeItem(SESSION_KEY);
    vi.restoreAllMocks();
  });

  it('starts on the loader with no steps rendered', async () => {
    const screen = render(AgentTrajectoryViewer);
    await expect.element(screen.getByRole('button', { name: 'Load example' })).toBeVisible();
    expect(screen.container.querySelectorAll('[data-step-index]').length).toBe(0);
    screen.unmount();
  });

  it('shows the bundled example steps after clicking Load example', async () => {
    const screen = render(AgentTrajectoryViewer);
    await loadExample(screen);
    await expect.element(screen.getByText('#1')).toBeVisible();
    await expect.element(screen.getByText('#6')).toBeVisible();
    screen.unmount();
  });

  it('shows an invalid JSON error and stays on the loader', async () => {
    const screen = render(AgentTrajectoryViewer);
    await screen.getByLabelText('Paste trajectory JSON').fill('{ not valid json');
    await screen.getByRole('button', { name: 'Load trajectory' }).click();
    await expect.element(screen.getByRole('alert')).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Load example' })).toBeVisible();
    expect(screen.container.querySelectorAll('[data-step-index]').length).toBe(0);
    screen.unmount();
  });

  it('swaps the detail pane when a different step is clicked', async () => {
    const screen = render(AgentTrajectoryViewer);
    await loadExample(screen);
    // Step 1 (the default selection) is the user's task prompt. Scoped to the rendered message
    // itself (data-testid="step-message"), not the page as a whole - the same substring also
    // appears, unavoidably, inside the collapsed Raw JSON code block for this step.
    await expect
      .element(screen.getByTestId('step-message').getByText(/failing test/))
      .toBeVisible();

    const rows = screen.container.querySelectorAll('[data-step-index]');
    /** @type {HTMLElement} */ (rows[1]).click();

    await expect
      .element(
        screen.getByTestId('step-message').getByText(/Let's look at it before making a change/)
      )
      .toBeVisible();
    screen.unmount();
  });

  it('renders reasoning content in a dedicated section when present', async () => {
    const screen = render(AgentTrajectoryViewer);
    await loadExample(screen);

    const rows = screen.container.querySelectorAll('[data-step-index]');
    /** @type {HTMLElement} */ (rows[1]).click();

    await expect
      .element(screen.getByTestId('step-reasoning').getByText(/user reported a bug in `calc.py`/))
      .toBeVisible();
    screen.unmount();
  });

  it('filters the list down to steps matching the search query', async () => {
    const screen = render(AgentTrajectoryViewer);
    await loadExample(screen);

    await screen.getByRole('searchbox', { name: 'Search steps...' }).fill('batch');

    await expect.poll(() => screen.container.querySelectorAll('[data-step-index]').length).toBe(1);
    const [remaining] = screen.container.querySelectorAll('[data-step-index]');
    expect(/** @type {HTMLElement} */ (remaining).dataset.stepIndex).toBe('4');
    screen.unmount();
  });

  it('filters by issue type using the issue dropdown', async () => {
    const screen = render(AgentTrajectoryViewer);
    await loadExample(screen);

    const issueSelect = screen.getByRole('combobox', { name: 'Filter by issue' });
    await issueSelect.selectOptions('warnings');

    await expect.poll(() => screen.container.querySelectorAll('[data-step-index]').length).toBe(1);
    const [remaining] = screen.container.querySelectorAll('[data-step-index]');
    expect(/** @type {HTMLElement} */ (remaining).dataset.stepIndex).toBe('2');
    screen.unmount();
  });

  it('filters down to only the error step with Errors only', async () => {
    const screen = render(AgentTrajectoryViewer);
    await loadExample(screen);

    const issueSelect = screen.getByRole('combobox', { name: 'Filter by issue' });
    await issueSelect.selectOptions('errors');

    await expect.poll(() => screen.container.querySelectorAll('[data-step-index]').length).toBe(1);
    const [remaining] = screen.container.querySelectorAll('[data-step-index]');
    expect(/** @type {HTMLElement} */ (remaining).dataset.stepIndex).toBe('3');
    screen.unmount();
  });

  it('shows error, warning, and complete badges on the matching step rows', async () => {
    const screen = render(AgentTrajectoryViewer);
    await loadExample(screen);

    const rows = screen.container.querySelectorAll('[data-step-index]');
    expect(rows[2].textContent).toContain('warning');
    expect(rows[3].textContent).toContain('error');
    expect(rows[5].textContent).toContain('complete');
    screen.unmount();
  });

  it('shows a severity-colored notice banner for a warning and an error observation', async () => {
    const screen = render(AgentTrajectoryViewer);
    await loadExample(screen);

    const rows = screen.container.querySelectorAll('[data-step-index]');
    /** @type {HTMLElement} */ (rows[2]).click();
    await expect
      .element(screen.getByTestId('observation-notice').getByText(/Non-standard environment path/))
      .toBeVisible();

    /** @type {HTMLElement} */ (rows[3]).click();
    await expect
      .element(screen.getByTestId('observation-notice').getByText(/unterminated object/))
      .toBeVisible();
    screen.unmount();
  });

  it('shows recovered fields and a malformed-output badge for an unparseable message', async () => {
    const screen = render(AgentTrajectoryViewer);
    await loadExample(screen);

    const rows = screen.container.querySelectorAll('[data-step-index]');
    /** @type {HTMLElement} */ (rows[3]).click();

    await expect.element(screen.getByText('malformed output')).toBeVisible();
    await expect
      .element(screen.getByTestId('step-message').getByText(/stray \+ 1 is the bug/))
      .toBeVisible();
    screen.unmount();
  });

  it('expands and collapses all detail sections with the Expand/Collapse buttons', async () => {
    const screen = render(AgentTrajectoryViewer);
    await loadExample(screen);

    const rows = screen.container.querySelectorAll('[data-step-index]');
    /** @type {HTMLElement} */ (rows[1]).click();
    await expect.element(screen.getByTestId('step-message')).toBeVisible();

    await screen.getByRole('button', { name: 'Collapse all' }).click();
    await expect.element(screen.getByTestId('step-message')).not.toBeVisible();

    await screen.getByRole('button', { name: 'Expand all' }).click();
    await expect.element(screen.getByTestId('step-message')).toBeVisible();
    screen.unmount();
  });

  it('jumps through every issue step when clicking Next issue, then wraps around', async () => {
    const screen = render(AgentTrajectoryViewer);
    await loadExample(screen);

    const nextBtn = screen.getByRole('button', { name: /Next issue/ });
    await expect.element(nextBtn).toBeVisible();

    /** @returns {string | undefined} */
    const selectedStepIndex = () => {
      const selected = screen.container.querySelector('[role="option"][aria-selected="true"]');
      return /** @type {HTMLElement | null} */ (selected)?.dataset.stepIndex;
    };

    // Step index 2 (#3) has the warning notice.
    await nextBtn.click();
    await expect.poll(selectedStepIndex).toBe('2');

    // Step index 3 (#4) has the error notice.
    await nextBtn.click();
    await expect.poll(selectedStepIndex).toBe('3');

    // No later issue step exists, so it wraps back to the first one.
    await nextBtn.click();
    await expect.poll(selectedStepIndex).toBe('2');
    screen.unmount();
  });

  it('moves the selection down with j and shows the next step detail', async () => {
    const screen = render(AgentTrajectoryViewer);
    await loadExample(screen);
    await expect
      .element(screen.getByTestId('step-message').getByText(/failing test/))
      .toBeVisible();

    // vitest-browser's Locator has no key-press method, so the keydown the list's onkeydown
    // handler listens for is dispatched directly on the focused element.
    const listbox = /** @type {HTMLElement} */ (
      screen.getByRole('listbox', { name: 'Trajectory steps' }).element()
    );
    listbox.focus();
    listbox.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'j', bubbles: true, cancelable: true })
    );

    await expect
      .element(
        screen.getByTestId('step-message').getByText(/Let's look at it before making a change/)
      )
      .toBeVisible();
    screen.unmount();
  });

  it('renders an unknown step field as a metadata row', async () => {
    const screen = render(AgentTrajectoryViewer);
    await loadExample(screen);

    const rows = screen.container.querySelectorAll('[data-step-index]');
    /** @type {HTMLElement} */ (rows[5]).click();

    // exact: true (and the step-metadata scope) rules out the quoted "sandbox_id" key inside the
    // same step's collapsed Raw JSON block, which otherwise also matches a plain substring search.
    const metadata = screen.getByTestId('step-metadata');
    await expect.element(metadata.getByText('sandbox_id', { exact: true })).toBeVisible();
    await expect.element(metadata.getByText('demo-sandbox-1', { exact: true })).toBeVisible();
    screen.unmount();
  });

  it('flips the Raw JSON copy button to confirm the copy', async () => {
    const screen = render(AgentTrajectoryViewer);
    await loadExample(screen);

    await screen.getByText('Raw JSON').click();
    const copyButton = screen.getByRole('button', { name: 'Copy' });
    await expect.element(copyButton).toBeVisible();
    await copyButton.click();
    await expect.element(screen.getByRole('button', { name: '✓ Copied' })).toBeVisible();
    screen.unmount();
  });

  it('returns to the loader when New JSON is clicked', async () => {
    const screen = render(AgentTrajectoryViewer);
    await loadExample(screen);

    await screen.getByRole('button', { name: 'New JSON' }).click();

    await expect.element(screen.getByRole('button', { name: 'Load example' })).toBeVisible();
    expect(screen.container.querySelectorAll('[data-step-index]').length).toBe(0);
    screen.unmount();
  });

  it('focuses search input when / is pressed', async () => {
    const screen = render(AgentTrajectoryViewer);
    await loadExample(screen);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));

    const searchInput = screen.getByRole('searchbox', { name: 'Search steps...' });
    await expect.element(searchInput).toHaveFocus();
    screen.unmount();
  });

  describe('pop-out', () => {
    it('does not hide a pane just from clicking pop-out when the popup is blocked', async () => {
      vi.spyOn(window, 'open').mockReturnValue(null);
      const screen = render(AgentTrajectoryViewer);
      await loadExample(screen);

      await screen.getByRole('button', { name: 'Open Detail in a new window' }).click();

      await expect
        .element(screen.getByRole('button', { name: 'Open Detail in a new window' }))
        .toBeVisible();
      await expect.element(screen.getByText('Pop-up blocked by the browser')).toBeVisible();
      screen.unmount();
    });

    it('stays on the normal loader when opened directly with a popout URL but no owner ever answers', async () => {
      setSearch('?popout=detail&session=orphan-session');
      const onsatellite = vi.fn();
      const screen = render(AgentTrajectoryViewer, { onsatellite });

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(onsatellite).not.toHaveBeenCalled();
      await expect.element(screen.getByRole('button', { name: 'Load example' })).toBeVisible();
      screen.unmount();
    });

    it('syncs the selected step to a Detail satellite, following the owner clicking a different row', async () => {
      const owner = render(AgentTrajectoryViewer);
      await loadExample(owner);

      const session = ownerSessionId(TOOL);
      setSearch(`?popout=detail&session=${session}`);
      const onsatellite = vi.fn();
      const satellite = render(AgentTrajectoryViewer, { onsatellite });
      await expect.poll(() => onsatellite.mock.calls).toEqual([[true, 'Detail']]);

      await expect
        .element(satellite.getByTestId('step-message').getByText(/failing test/))
        .toBeVisible();

      const rows = owner.container.querySelectorAll('[data-step-index]');
      /** @type {HTMLElement} */ (rows[1]).click();

      await expect
        .element(
          satellite.getByTestId('step-message').getByText(/Let's look at it before making a change/)
        )
        .toBeVisible();

      owner.unmount();
      satellite.unmount();
    });

    it('renders hljs- classed spans in a Detail satellite, proving it loaded its own highlighter', async () => {
      const owner = render(AgentTrajectoryViewer);
      await loadExample(owner);

      const session = ownerSessionId(TOOL);
      setSearch(`?popout=detail&session=${session}`);
      const satellite = render(AgentTrajectoryViewer);
      await expect
        .element(satellite.getByTestId('step-message').getByText(/failing test/))
        .toBeVisible();

      await satellite.getByText('Raw JSON').click();
      await expect
        .poll(() => satellite.container.querySelector('[class*="hljs-"]') !== null, {
          timeout: 5000
        })
        .toBe(true);

      owner.unmount();
      satellite.unmount();
    });

    it('lets a Steps satellite search/filter and select a row, updating the owner Detail pane', async () => {
      const owner = render(AgentTrajectoryViewer);
      await loadExample(owner);

      const session = ownerSessionId(TOOL);
      setSearch(`?popout=steps&session=${session}`);
      const satellite = render(AgentTrajectoryViewer);
      await expect
        .poll(() => satellite.container.querySelectorAll('[data-step-index]').length)
        .toBe(6);

      // Scoped via `.locator` - the owner still renders its own search box in its toolbar
      // regardless of pop-out state, so an unscoped query would be ambiguous between the two.
      await satellite.locator.getByRole('searchbox', { name: 'Search steps...' }).fill('batch');
      await expect
        .poll(() => satellite.container.querySelectorAll('[data-step-index]').length)
        .toBe(1);

      const [remaining] = satellite.container.querySelectorAll('[data-step-index]');
      expect(/** @type {HTMLElement} */ (remaining).dataset.stepIndex).toBe('4');
      /** @type {HTMLElement} */ (remaining).click();

      await expect.element(owner.getByText('Step 5')).toBeVisible();

      owner.unmount();
      satellite.unmount();
    });

    it('syncs the issue filter from a Steps satellite back to the owner list', async () => {
      const owner = render(AgentTrajectoryViewer);
      await loadExample(owner);

      const session = ownerSessionId(TOOL);
      setSearch(`?popout=steps&session=${session}`);
      const satellite = render(AgentTrajectoryViewer);
      await expect
        .poll(() => satellite.container.querySelectorAll('[data-step-index]').length)
        .toBe(6);

      await satellite.locator
        .getByRole('combobox', { name: 'Filter by issue' })
        .selectOptions('errors');

      // The owner's Steps pane is hidden while popped out, so the filtered list is only visible
      // in the satellite - selecting the remaining row there is what proves the shared selection
      // (set from the satellite) reaches the owner's still-rendered Detail pane.
      await expect
        .poll(() => satellite.container.querySelectorAll('[data-step-index]').length)
        .toBe(1);
      const [remaining] = satellite.container.querySelectorAll('[data-step-index]');
      expect(/** @type {HTMLElement} */ (remaining).dataset.stepIndex).toBe('3');
      /** @type {HTMLElement} */ (remaining).click();

      await expect.element(owner.getByText('Step 4')).toBeVisible();

      owner.unmount();
      satellite.unmount();
    });

    it('brings the pane home when the satellite returns', async () => {
      const owner = render(AgentTrajectoryViewer);
      await loadExample(owner);

      const session = ownerSessionId(TOOL);
      setSearch(`?popout=detail&session=${session}`);
      const satellite = render(AgentTrajectoryViewer);
      await expect
        .element(owner.getByRole('button', { name: 'Open Detail in a new window' }))
        .not.toBeInTheDocument();

      await satellite.getByRole('button', { name: '↩ Return to main window' }).click();

      await expect
        .element(owner.getByRole('button', { name: 'Open Detail in a new window' }))
        .toBeVisible();

      owner.unmount();
      satellite.unmount();
    });

    it('shows a waiting placeholder in a satellite once the owner resets via New JSON', async () => {
      const owner = render(AgentTrajectoryViewer);
      await loadExample(owner);

      const session = ownerSessionId(TOOL);
      setSearch(`?popout=detail&session=${session}`);
      const satellite = render(AgentTrajectoryViewer);
      await expect
        .element(satellite.getByTestId('step-message').getByText(/failing test/))
        .toBeVisible();

      await owner.getByRole('button', { name: 'New JSON' }).click();

      await expect
        .element(satellite.getByText('Waiting for the main window', { exact: false }))
        .toBeVisible();

      owner.unmount();
      satellite.unmount();
    });
  });
});
