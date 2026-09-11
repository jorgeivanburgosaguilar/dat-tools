import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import DiffChecker from './DiffChecker.svelte';
import { DEFAULT_ORIGINAL, DEFAULT_CHANGED } from '$lib/text-diff.js';
import { ownerSessionId } from '$lib/popout-channel.js';

const TOOL = 'diff-checker';
const SESSION_KEY = `dat-tools:popout-session:${TOOL}`;

/** @param {string} search */
function setSearch(search) {
  const url = new URL(location.href);
  url.search = search;
  history.replaceState(null, '', url.toString());
}

const JS_SAMPLE = `function greet(name) {
  console.log('Hello, ' + name + '!');
  return true;
}

const users = ['ada', 'grace', 'margaret'];
for (const user of users) {
  greet(user);
}`;

describe('DiffChecker', () => {
  // Every render creates a real BroadcastChannel bridge (see popout-sync.js's createOwnerSync,
  // which runs unconditionally from onMount) - left unmounted and un-reset, later tests' owner
  // instances would keep sharing both the channel and the sessionStorage-backed session id with
  // every earlier test's still-live instance, so any pop-out test added here would receive replies
  // from multiple stale "owners" instead of just the one it paired with.
  afterEach(() => {
    setSearch('');
    sessionStorage.removeItem(SESSION_KEY);
    vi.restoreAllMocks();
  });

  it('renders two textareas in edit mode with an Original/Changed segmented control', async () => {
    const screen = await render(DiffChecker, { initialOriginal: 'a', initialChanged: 'b' });
    expect(screen.container.querySelectorAll('textarea')).toHaveLength(2);
    // exact: true - the segmented-control button's accessible name is 'Original'/'Changed'; the
    // per-pane pop-out button's is 'Open Original in a new window', which contains it as a
    // substring and would otherwise also match.
    await expect
      .element(screen.getByRole('button', { name: 'Original', exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByRole('button', { name: 'Changed', exact: true }))
      .toBeVisible();
    await screen.unmount();
  });

  it('switches to a read-only diff view on Find Difference and back to editing on Edit Texts', async () => {
    const screen = await render(DiffChecker, {
      initialOriginal: 'alpha\nbeta',
      initialChanged: 'alpha\ngamma'
    });
    await screen.getByRole('button', { name: 'Find Difference' }).click();
    expect(screen.container.querySelectorAll('textarea')).toHaveLength(0);
    await expect.element(screen.getByText('beta')).toBeVisible();
    await expect.element(screen.getByText('gamma')).toBeVisible();

    await screen.getByRole('button', { name: 'Edit Texts' }).click();
    const textareas = screen.container.querySelectorAll('textarea');
    expect(textareas).toHaveLength(2);
    expect(/** @type {HTMLTextAreaElement} */ (textareas[0]).value).toBe('alpha\nbeta');
    expect(/** @type {HTMLTextAreaElement} */ (textareas[1]).value).toBe('alpha\ngamma');
    await screen.unmount();
  });

  it('renders the same number of rows in both panes', async () => {
    const screen = await render(DiffChecker, {
      initialOriginal: 'a\nb\nc',
      initialChanged: 'a\nX\nc\nd'
    });
    await screen.getByRole('button', { name: 'Find Difference' }).click();
    const left = screen.container.querySelector('[data-pane="Original"]');
    const right = screen.container.querySelector('[data-pane="Changed"]');
    const leftRows = left?.querySelectorAll('[data-diff-row]') ?? [];
    const rightRows = right?.querySelectorAll('[data-diff-row]') ?? [];
    expect(leftRows.length).toBeGreaterThan(0);
    expect(leftRows.length).toBe(rightRows.length);
    await screen.unmount();
  });

  it('keeps the same row count on both panes after toggling Wrap on in diff mode', async () => {
    // Actual measured row heights need real Tailwind layout (see the "locks vertical scroll" test
    // below), which this component-only render doesn't have - so this only exercises the wiring:
    // the Wrap toggle exists in diff mode, and switching it on doesn't change how many rows either
    // pane renders (each pane still emits one row per cell, just with a different height style).
    const screen = await render(DiffChecker, {
      initialOriginal: 'a\nb\nc',
      initialChanged: 'a\nX\nc\nd'
    });
    await screen.getByRole('button', { name: 'Find Difference' }).click();
    await screen.getByRole('button', { name: 'Wrap' }).click();

    const left = screen.container.querySelector('[data-pane="Original"]');
    const right = screen.container.querySelector('[data-pane="Changed"]');
    const leftRows = left?.querySelectorAll('[data-diff-row]') ?? [];
    const rightRows = right?.querySelectorAll('[data-diff-row]') ?? [];
    expect(leftRows.length).toBeGreaterThan(0);
    expect(leftRows.length).toBe(rightRows.length);
    await screen.unmount();
  });

  it('shows an identical-texts status for two equal inputs', async () => {
    const screen = await render(DiffChecker, {
      initialOriginal: 'same\ntext',
      initialChanged: 'same\ntext'
    });
    await screen.getByRole('button', { name: 'Find Difference' }).click();
    await expect.element(screen.getByText('Texts are identical.')).toBeVisible();
    await screen.unmount();
  });

  it('marks a single added space with a diff-char-added element', async () => {
    const screen = await render(DiffChecker, {
      initialOriginal: 'alpha beta',
      initialChanged: 'alpha  beta'
    });
    await screen.getByRole('button', { name: 'Find Difference' }).click();
    const added = screen.container.querySelector('.diff-char-added');
    expect(added).not.toBeNull();
    // A diffed space always renders as its "·" glyph now, not the literal character.
    expect(added?.textContent).toBe('·');
    await screen.unmount();
  });

  it('always renders a whitespace glyph on a diffed span, with no toggle in the DOM', async () => {
    const screen = await render(DiffChecker, {
      initialOriginal: 'alpha beta',
      initialChanged: 'alpha  beta'
    });
    await screen.getByRole('button', { name: 'Find Difference' }).click();

    const added = screen.container.querySelector('.diff-char-added');
    expect(added?.querySelector('.diff-ws')).not.toBeNull();

    const buttons = Array.from(screen.container.querySelectorAll('button'));
    expect(buttons.some((b) => b.textContent?.trim() === 'Show whitespace')).toBe(false);
    await screen.unmount();
  });

  it('also renders a whitespace glyph on unchanged text (faint, but always present)', async () => {
    const screen = await render(DiffChecker, {
      initialOriginal: 'alpha beta',
      initialChanged: 'alpha  beta'
    });
    await screen.getByRole('button', { name: 'Find Difference' }).click();

    const original = screen.container.querySelector('[data-pane="Original"]');
    // "alpha beta" has one unchanged single space (before "beta") that is never part of the diff.
    const wsSpans = Array.from(original?.querySelectorAll('.diff-ws') ?? []);
    const unchangedWs = wsSpans.filter(
      (el) => el.closest('.diff-char-added, .diff-char-removed') === null
    );
    expect(unchangedWs.length).toBeGreaterThan(0);
    await screen.unmount();
  });

  it('renders a pilcrow at the end of a line that has a line terminator', async () => {
    const screen = await render(DiffChecker, {
      initialOriginal: 'one\ntwo',
      initialChanged: 'one\ntwo'
    });
    await screen.getByRole('button', { name: 'Find Difference' }).click();
    const original = screen.container.querySelector('[data-pane="Original"]');
    expect(original?.textContent).toContain('¶');
    await screen.unmount();
  });

  it('renders hljs- classed spans after picking JavaScript', async () => {
    const screen = await render(DiffChecker, {
      initialOriginal: 'const a = 1;',
      initialChanged: 'const a = 2;'
    });
    await screen.getByRole('button', { name: 'Find Difference' }).click();
    const select = screen.container.querySelector('select');
    expect(select).not.toBeNull();
    /** @type {HTMLSelectElement} */ (select).value = 'javascript';
    select?.dispatchEvent(new Event('change', { bubbles: true }));

    await expect
      .poll(() => screen.container.querySelector('[class*="hljs-"]') !== null, { timeout: 5000 })
      .toBe(true);
    await screen.unmount();
  });

  it('auto-detects the language from a clear JavaScript sample on Find Difference', async () => {
    const screen = await render(DiffChecker, {
      initialOriginal: JS_SAMPLE,
      initialChanged: JS_SAMPLE.replace('Hello', 'Hi')
    });
    await screen.getByRole('button', { name: 'Find Difference' }).click();

    const select = /** @type {HTMLSelectElement} */ (screen.container.querySelector('select'));
    await expect.poll(() => select.value, { timeout: 5000 }).toBe('javascript');
    await screen.unmount();
  });

  it('keeps a manually picked language across a later Find Difference', async () => {
    const screen = await render(DiffChecker, {
      initialOriginal: JS_SAMPLE,
      initialChanged: JS_SAMPLE
    });
    const select = /** @type {HTMLSelectElement} */ (screen.container.querySelector('select'));
    select.value = 'css';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    await screen.getByRole('button', { name: 'Find Difference' }).click();
    await screen.getByRole('button', { name: 'Edit Texts' }).click();
    await screen.getByRole('button', { name: 'Find Difference' }).click();

    // Give any stray auto-detect a moment to (not) land, then assert the manual pick held.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(select.value).toBe('css');
    await screen.unmount();
  });

  it('leaves the language on plain for short, ambiguous text after Find Difference', async () => {
    const screen = await render(DiffChecker, {
      initialOriginal: 'const a = 1;',
      initialChanged: 'const a = 2;'
    });
    const select = /** @type {HTMLSelectElement} */ (screen.container.querySelector('select'));
    await screen.getByRole('button', { name: 'Find Difference' }).click();

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(select.value).toBe('plain');
    await screen.unmount();
  });

  it('adds a third, uncolored Source pane when toggled on, absent in edit mode', async () => {
    const screen = await render(DiffChecker, {
      initialOriginal: 'alpha\nbeta',
      initialChanged: 'alpha\ngamma'
    });
    expect(screen.container.querySelector('[data-pane="Source"]')).toBeNull();

    await screen.getByRole('button', { name: 'Find Difference' }).click();
    expect(screen.container.querySelector('[data-pane="Source"]')).toBeNull();

    await screen.getByRole('button', { name: 'Source pane' }).click();
    const source = screen.container.querySelector('[data-pane="Source"]');
    expect(source).not.toBeNull();
    expect(source?.querySelector('.diff-char-added, .diff-char-removed')).toBeNull();

    const original = screen.container.querySelector('[data-pane="Original"]');
    const sourceRows = source?.querySelectorAll('[data-diff-row]') ?? [];
    const originalRows = original?.querySelectorAll('[data-diff-row]') ?? [];
    expect(sourceRows.length).toBe(originalRows.length);
    await screen.unmount();
  });

  it('locks vertical scroll between the two panes', async () => {
    // This is a Tailwind-driven browser test with no CSS pipeline attached (component-only
    // render, no app.css), so the panes' real flex/overflow layout never engages here - that
    // full-stack behavior is covered by the manual verification pass against the live page.
    // What's tested here is the scroll-lock wiring itself: force a genuine scrollable region
    // with inline styles, then confirm the $effect in each DiffPane actually mirrors scrollTop.
    const many = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n');
    const screen = await render(DiffChecker, {
      initialOriginal: many,
      initialChanged: many + '\nextra'
    });
    await screen.getByRole('button', { name: 'Find Difference' }).click();

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
    await screen.unmount();
  });

  it('loads sample content, swaps panes, and clears back to edit mode', async () => {
    const screen = await render(DiffChecker, { initialOriginal: 'x', initialChanged: 'y' });

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
    await screen.unmount();
  });

  it('disables the Find Difference button when both panes are empty', async () => {
    const screen = await render(DiffChecker, { initialOriginal: '', initialChanged: '' });
    await expect.element(screen.getByRole('button', { name: 'Find Difference' })).toBeDisabled();
    await screen.unmount();
  });

  describe('pop-out', () => {
    it('does not hide a pane just from clicking pop-out when the popup is blocked', async () => {
      vi.spyOn(window, 'open').mockReturnValue(null);
      const screen = await render(DiffChecker, { initialOriginal: 'a', initialChanged: 'b' });

      // A plain `.click()` locator interaction on this button silently no-ops in
      // vitest-browser-playwright 5.0.0 (the click resolves, but no event ever reaches the
      // element). Likely an iframe-edge coordinate mismatch in the CDP click dispatch -
      // Vitest Browser Mode runs each spec file in its own iframe (see
      // packages/browser/src/client/orchestrator.ts) and this button (like
      // AgentTrajectoryViewer's analogous "Open Detail" button - see the comment there) sits
      // at the very top of its toolbar row. Ruled out: wrong/ambiguous selector, an overlay
      // intercepting the click, Svelte 5.57 specifically, raw playwright 1.63 specifically,
      // and viewport size. Re-test with a plain locator click next time
      // vitest/@vitest/browser-playwright bump past 5.0.0 - this may no longer be needed.
      // Native DOM click as a workaround instead:
      /** @type {HTMLElement} */ (
        screen.container.querySelector('[aria-label="Open Original in a new window"]')
      ).click();

      await expect
        .element(screen.getByRole('button', { name: 'Open Original in a new window' }))
        .toBeVisible();
      await expect.element(screen.getByText('Pop-up blocked by the browser')).toBeVisible();
      await screen.unmount();
    });

    it('syncs the original text live to a satellite hosting that pane, and hides pop-out buttons once only one pane remains', async () => {
      const owner = await render(DiffChecker, { initialOriginal: 'a', initialChanged: 'b\nc' });

      const session = ownerSessionId(TOOL);
      setSearch(`?popout=original&session=${session}`);
      const onsatellite = vi.fn();
      const satellite = await render(DiffChecker, { onsatellite });
      await expect.poll(() => onsatellite.mock.calls).toEqual([[true, 'Original']]);

      // DiffLayout hides its pop-out controls once panes.length <= 1 - popping the last visible
      // pane would leave the owner window empty.
      await expect
        .element(owner.getByRole('button', { name: 'Open Changed in a new window' }))
        .not.toBeInTheDocument();

      await satellite.getByPlaceholder('Paste the original text here…').fill('a\nnew line');
      await expect.element(owner.getByText('2 / 2 lines')).toBeVisible();

      await owner.unmount();
      await satellite.unmount();
    });

    it('brings the pane home when the satellite returns', async () => {
      const owner = await render(DiffChecker, { initialOriginal: 'a', initialChanged: 'b' });

      const session = ownerSessionId(TOOL);
      setSearch(`?popout=changed&session=${session}`);
      const satellite = await render(DiffChecker);
      await expect
        .element(owner.getByRole('button', { name: 'Open Changed in a new window' }))
        .not.toBeInTheDocument();

      await satellite.getByRole('button', { name: '↩ Return to main window' }).click();

      await expect
        .element(owner.getByRole('button', { name: 'Open Changed in a new window' }))
        .toBeVisible();

      await owner.unmount();
      await satellite.unmount();
    });

    it('switches a satellite from an editable textarea to a read-only diff pane when the owner runs Find Difference', async () => {
      const owner = await render(DiffChecker, { initialOriginal: 'a', initialChanged: 'b' });

      const session = ownerSessionId(TOOL);
      setSearch(`?popout=original&session=${session}`);
      const satellite = await render(DiffChecker);
      await expect
        .element(satellite.getByPlaceholder('Paste the original text here…'))
        .toBeVisible();

      await owner.getByRole('button', { name: 'Find Difference' }).click();

      await expect
        .element(satellite.getByPlaceholder('Paste the original text here…'))
        .not.toBeInTheDocument();
      expect(satellite.container.querySelectorAll('textarea')).toHaveLength(0);

      await owner.unmount();
      await satellite.unmount();
    });

    it('ships the computed diff to a satellite, which renders the diffed content with no editable textarea', async () => {
      const owner = await render(DiffChecker, {
        initialOriginal: 'line1\nline2',
        initialChanged: 'line1\nreplaced'
      });
      await owner.getByRole('button', { name: 'Find Difference' }).click();

      const session = ownerSessionId(TOOL);
      setSearch(`?popout=changed&session=${session}`);
      const onsatellite = vi.fn();
      const satellite = await render(DiffChecker, { onsatellite });
      await expect.poll(() => onsatellite.mock.calls).toEqual([[true, 'Changed']]);

      expect(satellite.container.querySelectorAll('textarea')).toHaveLength(0);
      await expect.element(satellite.getByText('replaced')).toBeVisible();

      await owner.unmount();
      await satellite.unmount();
    });

    it('shows a placeholder in a Source satellite once the owner leaves the diff view', async () => {
      const owner = await render(DiffChecker, { initialOriginal: 'a', initialChanged: 'b' });
      await owner.getByRole('button', { name: 'Find Difference' }).click();
      await owner.getByRole('button', { name: 'Source pane' }).click();

      const session = ownerSessionId(TOOL);
      setSearch(`?popout=source&session=${session}`);
      const satellite = await render(DiffChecker);
      await expect
        .element(satellite.getByText('only available in the diff view', { exact: false }))
        .not.toBeInTheDocument();

      await owner.getByRole('button', { name: 'Edit Texts' }).click();
      await expect
        .element(satellite.getByText('only available in the diff view', { exact: false }))
        .toBeVisible();

      await owner.unmount();
      await satellite.unmount();
    });

    it('keeps a popped-out pane in sync with the owner via scroll fraction, not pixels', async () => {
      // Same real-scrollable-region trick as "locks vertical scroll between the two panes" above,
      // now across two separate component instances standing in for two windows.
      const many = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n');
      const owner = await render(DiffChecker, {
        initialOriginal: many,
        initialChanged: many + '\nextra'
      });
      await owner.getByRole('button', { name: 'Find Difference' }).click();

      const session = ownerSessionId(TOOL);
      setSearch(`?popout=original&session=${session}`);
      const satellite = await render(DiffChecker);
      await expect
        .poll(() => satellite.container.querySelector('[data-pane="Original"]'))
        .not.toBeNull();

      const ownerChanged = /** @type {HTMLElement} */ (
        owner.container.querySelector('[data-pane="Changed"] .overflow-auto')
      );
      const satOriginal = /** @type {HTMLElement} */ (
        satellite.container.querySelector('[data-pane="Original"] .overflow-auto')
      );
      expect(ownerChanged).not.toBeNull();
      expect(satOriginal).not.toBeNull();
      ownerChanged.style.cssText = 'height: 100px; overflow: auto; display: block;';
      satOriginal.style.cssText = 'height: 100px; overflow: auto; display: block;';

      satOriginal.scrollTop = 100;
      satOriginal.dispatchEvent(new Event('scroll', { bubbles: true }));

      await expect.poll(() => ownerChanged.scrollTop, { timeout: 3000 }).toBeGreaterThan(0);

      await owner.unmount();
      await satellite.unmount();
    });
  });
});
