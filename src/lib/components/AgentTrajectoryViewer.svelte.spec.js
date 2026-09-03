import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import AgentTrajectoryViewer from './AgentTrajectoryViewer.svelte';

/** @param {ReturnType<typeof render>} screen */
async function loadExample(screen) {
  await screen.getByRole('button', { name: 'Load example' }).click();
  await expect.poll(() => screen.container.querySelectorAll('[data-step-index]').length).toBe(4);
}

describe('AgentTrajectoryViewer', () => {
  it('starts on the loader with no steps rendered', async () => {
    const screen = render(AgentTrajectoryViewer);
    await expect.element(screen.getByRole('button', { name: 'Load example' })).toBeVisible();
    expect(screen.container.querySelectorAll('[data-step-index]').length).toBe(0);
  });

  it('shows the bundled example steps after clicking Load example', async () => {
    const screen = render(AgentTrajectoryViewer);
    await loadExample(screen);
    await expect.element(screen.getByText('#1')).toBeVisible();
    await expect.element(screen.getByText('#4')).toBeVisible();
  });

  it('shows an invalid JSON error and stays on the loader', async () => {
    const screen = render(AgentTrajectoryViewer);
    await screen.getByLabelText('Paste trajectory JSON').fill('{ not valid json');
    await screen.getByRole('button', { name: 'Load trajectory' }).click();
    await expect.element(screen.getByRole('alert')).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Load example' })).toBeVisible();
    expect(screen.container.querySelectorAll('[data-step-index]').length).toBe(0);
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
  });

  it('filters the list down to steps matching the search query', async () => {
    const screen = render(AgentTrajectoryViewer);
    await loadExample(screen);

    await screen.getByRole('searchbox', { name: 'Search steps...' }).fill('pytest');

    await expect.poll(() => screen.container.querySelectorAll('[data-step-index]').length).toBe(1);
    const [remaining] = screen.container.querySelectorAll('[data-step-index]');
    expect(/** @type {HTMLElement} */ (remaining).dataset.stepIndex).toBe('2');
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
  });

  it('renders an unknown step field as a metadata row', async () => {
    const screen = render(AgentTrajectoryViewer);
    await loadExample(screen);

    const rows = screen.container.querySelectorAll('[data-step-index]');
    /** @type {HTMLElement} */ (rows[3]).click();

    // exact: true (and the step-metadata scope) rules out the quoted "sandbox_id" key inside the
    // same step's collapsed Raw JSON block, which otherwise also matches a plain substring search.
    const metadata = screen.getByTestId('step-metadata');
    await expect.element(metadata.getByText('sandbox_id', { exact: true })).toBeVisible();
    await expect.element(metadata.getByText('demo-sandbox-1', { exact: true })).toBeVisible();
  });

  it('flips the Raw JSON copy button to confirm the copy', async () => {
    const screen = render(AgentTrajectoryViewer);
    await loadExample(screen);

    await screen.getByText('Raw JSON').click();
    const copyButton = screen.getByRole('button', { name: 'Copy' });
    await expect.element(copyButton).toBeVisible();
    await copyButton.click();
    await expect.element(screen.getByRole('button', { name: '✓ Copied' })).toBeVisible();
  });

  it('returns to the loader when New JSON is clicked', async () => {
    const screen = render(AgentTrajectoryViewer);
    await loadExample(screen);

    await screen.getByRole('button', { name: 'New JSON' }).click();

    await expect.element(screen.getByRole('button', { name: 'Load example' })).toBeVisible();
    expect(screen.container.querySelectorAll('[data-step-index]').length).toBe(0);
  });
});
