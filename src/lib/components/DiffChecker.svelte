<script>
  import { untrack, onMount } from 'svelte';
  import DiffLayout from '$lib/components/DiffLayout.svelte';
  import CodeEditorPane from '$lib/components/CodeEditorPane.svelte';
  import DiffPane from '$lib/components/DiffPane.svelte';
  import PopoutSatelliteBar from '$lib/components/PopoutSatelliteBar.svelte';
  import { createPopoutSync } from '$lib/popout-sync.js';
  import { computeDiff, collapseRows, DEFAULT_ORIGINAL, DEFAULT_CHANGED } from '$lib/text-diff.js';
  import {
    LANGUAGES,
    ensureHighlighter,
    highlightLines,
    detectLanguage
  } from '$lib/syntax-highlight.js';
  import { mergeRuns } from '$lib/diff-render.js';
  import { maxRowHeights } from '$lib/line-gutter.js';
  import { loadWrapPreference, saveWrapPreference } from '$lib/wrap-preference.js';

  const TOOL = 'diff-checker';

  /**
   * @typedef {Object} DiffCheckerProps
   * @property {string} [initialOriginal]
   * @property {string} [initialChanged]
   * @property {(satellite: boolean, paneLabel?: string) => void} [onsatellite] - Fired once this
   *   window's role is known, so the route page can hide its "Back to Tools" header chrome in a
   *   satellite window and title the window/tab after the pane it's showing.
   */

  /** @type {DiffCheckerProps} */
  let { initialOriginal = '', initialChanged = '', onsatellite = () => {} } = $props();

  // Grouped into one $state object (rather than separate `let`s) so `applyPatch` from `popout.js`
  // can mutate it directly by key - see popout-sync.js's doc comment on why the sync layer owns no
  // state of its own. `diff` is computed once per `runDiff()`/`swapTexts()`/`loadSample()` and
  // shipped as data rather than recomputed independently in each window: `computeDiff` takes a
  // wall-clock `timeout` budget, so it is not deterministic across two windows under different CPU
  // load - a backgrounded popup is exactly that.
  let shared = $state({
    original: untrack(() => initialOriginal),
    changed: untrack(() => initialChanged),
    mode: /** @type {'edit' | 'diff'} */ ('edit'),
    diff: /** @type {import('$lib/text-diff.js').DiffResult | null} */ (null),
    language: 'plain',
    languageIsManual: false,
    showSource: false,
    wrap: untrack(() => loadWrapPreference('diff-checker')),
    collapseUnchanged: false,
    scrollFractionY: 0,
    scrollFractionX: 0
  });

  let highlightLoading = $state(false);

  // Not structured-cloneable, so never part of `shared` - a satellite loads its own instance (see
  // the effect below).
  /** @type {import('$lib/syntax-highlight.js').Lowlight | null} */
  let lowlight = $state(null);

  // Pane-local pixel scroll lock, unchanged from before this feature: keeps whichever diff panes
  // are rendered *in this same window* aligned to the pixel, exactly as many rows as they all
  // share. Cross-window sync (a different window, necessarily a different pane width) instead uses
  // `shared.scrollFractionY/X` below - see DiffPane.svelte's doc comment on why pixels can't cross
  // that boundary.
  let scrollTop = $state(0);
  let scrollLeft = $state(0);

  // Each diff-mode DiffPane reports its own natural (unclamped) row heights here, keyed by pane
  // id; merged below into one array so a row pair stays level even when only one side wraps.
  /** @type {Record<string, number[]>} */
  let paneRowHeights = $state({});

  // --- Pop-out sync -----------------------------------------------------------------------------

  /** @type {ReturnType<typeof createPopoutSync> | null} */
  let sync = null;
  let syncReady = $state(false);
  // Set from `sync.isSatelliteRequest` as soon as `sync` exists - see popout-sync.js's doc comment
  // on why ownership checks must gate on this, not merely on `isSatellite`.
  let isSatelliteRequest = $state(false);

  /** Owner only: pane ids ('original' | 'changed' | 'source') currently confirmed popped out. */
  let poppedIds = $state(/** @type {string[]} */ ([]));
  /** Whether the owner's handshake reply has arrived and this window is showing just one pane. */
  let isSatellite = $state(false);
  /** Satellite only: which pane this window is showing. */
  let satellitePaneId = $state(/** @type {'original' | 'changed' | 'source' | null} */ (null));
  /** Satellite only: whether the owner window is currently reachable. */
  let connected = $state(false);
  let popoutBlockedHint = $state(false);

  let canSend = $derived(syncReady && (isSatelliteRequest ? isSatellite : true));
  let isOwnerWindow = $derived(syncReady && !isSatelliteRequest);

  /** @param {string} id */
  function hostsPane(id) {
    return isSatelliteRequest ? isSatellite && satellitePaneId === id : !poppedIds.includes(id);
  }

  // Guards "Swap texts" / "Sample" / "Clear" - all three write both `original` and `changed`
  // directly from the owner's toolbar. If either pane is currently popped out, writing here would
  // silently desync the two windows exactly like the Markdown/JSON Clear bug: the send effects
  // below only ever broadcast a pane's text from the window that *hosts* it, so an owner write
  // while not hosting the pane would never reach the satellite that's actually showing it.
  let canEditBothTexts = $derived(
    !poppedIds.includes('original') && !poppedIds.includes('changed')
  );

  let satellitePaneLabel = $derived(
    satellitePaneId === 'original'
      ? 'Original'
      : satellitePaneId === 'changed'
        ? 'Changed'
        : 'Source'
  );

  // Whether another window exists that needs this window's scroll position - gates whether
  // DiffPane is handed a `scrollFractionY/X` prop at all (see DiffPane.svelte: passing a real
  // value when nothing is popped out would fight the pixel-based intra-window lock for no reason).
  let crossWindowScrollSync = $derived(isSatellite || poppedIds.length > 0);

  /**
   * @param {string} id
   * @param {number[]} heights
   */
  function onPaneMeasure(id, heights) {
    paneRowHeights = { ...paneRowHeights, [id]: heights };
  }

  /**
   * @param {number} t
   * @param {number} l
   */
  function onPaneScroll(t, l) {
    scrollTop = t;
    scrollLeft = l;
  }

  /**
   * @param {number} y
   * @param {number} x
   */
  function onPaneScrollFraction(y, x) {
    // Tolerance, not `===`: an incoming fraction converted back to this pane's own pixel scroll
    // position and re-measured rarely lands on the exact same float, so a strict compare would
    // re-broadcast (and DiffPane re-apply) a value that's already effectively converged - the
    // 0.0005 slack is what actually terminates the echo.
    if (Math.abs(y - shared.scrollFractionY) > 0.0005) shared.scrollFractionY = y;
    if (Math.abs(x - shared.scrollFractionX) > 0.0005) shared.scrollFractionX = x;
  }

  // Ids of the panes actually rendered *in this window* right now - used only to decide which
  // `paneRowHeights` entries are still current. Fixes a pre-existing bug: the record was never
  // pruned when a pane disappeared (already true today when Source toggles off), so a vanished
  // pane's stale heights kept padding the survivors - worse once panes can also leave via pop-out.
  let visiblePaneIds = $derived(
    isSatellite
      ? satellitePaneId
        ? [satellitePaneId]
        : []
      : (shared.mode === 'edit'
          ? ['original', 'changed']
          : [...(shared.showSource ? ['source'] : []), 'original', 'changed']
        ).filter((id) => !poppedIds.includes(id))
  );
  let rowHeights = $derived(
    maxRowHeights(visiblePaneIds.map((id) => paneRowHeights[id]).filter(Boolean))
  );

  // --- Sync sends ---------------------------------------------------------------------------------
  // Split per AGENTS.md/plan guidance: `diff` is heavy and changes rarely (only on an explicit
  // click), so it gets its own effect rather than being grouped with anything a keystroke touches.

  $effect(() => {
    if (!canSend || !hostsPane('original')) return;
    sync?.send({ original: shared.original });
  });
  $effect(() => {
    if (!canSend || !hostsPane('changed')) return;
    sync?.send({ changed: shared.changed });
  });
  $effect(() => {
    if (!isOwnerWindow) return;
    // `shared.diff` is itself a live Svelte $state proxy (any object assigned into a $state
    // property gets deeply proxy-wrapped) - popout.js's makeEnvelope() JSON-round-trips every
    // payload specifically so a value like this reaches BroadcastChannel.postMessage as plain,
    // structured-clone-safe data instead of throwing DataCloneError. See its doc comment.
    sync?.send({ diff: shared.diff });
  });
  $effect(() => {
    if (!isOwnerWindow) return;
    sync?.send({
      mode: shared.mode,
      language: shared.language,
      languageIsManual: shared.languageIsManual,
      showSource: shared.showSource
    });
  });
  $effect(() => {
    if (!canSend) return;
    sync?.send({ wrap: shared.wrap, collapseUnchanged: shared.collapseUnchanged });
  });
  $effect(() => {
    if (!canSend) return;
    sync?.send({
      scrollFractionY: shared.scrollFractionY,
      scrollFractionX: shared.scrollFractionX
    });
  });

  $effect(() => {
    if (isSatellite) return;
    saveWrapPreference('diff-checker', shared.wrap);
  });

  // A satellite needs its own highlighter instance - `lowlight` isn't structured-cloneable, so it
  // can never be part of `shared`. Only ever runs post-handshake in a real browser (never during
  // SvelteKit's prerender pass, which is what the "no dynamic import from module scope or an
  // unconditional effect" rule in syntax-highlight.js's doc comment actually guards against).
  $effect(() => {
    if (!isSatellite || shared.language === 'plain' || lowlight || highlightLoading) return;
    highlightLoading = true;
    ensureHighlighter()
      .then((instance) => {
        lowlight = instance;
      })
      .finally(() => {
        highlightLoading = false;
      });
  });

  onMount(() => {
    sync = createPopoutSync({
      tool: TOOL,
      shared,
      callbacks: {
        onSatelliteReady: (paneId) => {
          isSatellite = true;
          satellitePaneId = /** @type {'original' | 'changed' | 'source'} */ (paneId);
          const label =
            paneId === 'original' ? 'Original' : paneId === 'changed' ? 'Changed' : 'Source';
          onsatellite(true, label);
        },
        onConnectionChange: (value) => {
          connected = value;
        },
        onOwnerPoppedChange: (ids) => {
          poppedIds = ids;
        },
        onPopoutBlocked: () => {
          popoutBlockedHint = true;
          setTimeout(() => (popoutBlockedHint = false), 4000);
        }
      }
    });
    isSatelliteRequest = sync.isSatelliteRequest;
    syncReady = true;

    return () => {
      sync?.destroy();
    };
  });

  // Diffing is an explicit, user-triggered action (not $derived / not an $effect): typing must
  // never recompute the diff, and nothing here may run during SvelteKit's prerender pass either.
  let canDiff = $derived(shared.original !== '' || shared.changed !== '');

  function runDiff() {
    shared.diff = computeDiff(shared.original, shared.changed);
    shared.mode = 'diff';
    scrollTop = 0;
    scrollLeft = 0;
    shared.scrollFractionY = 0;
    shared.scrollFractionX = 0;
    if (!shared.languageIsManual) autoDetectLanguage();
  }

  function backToEdit() {
    shared.mode = 'edit';
  }

  function swapTexts() {
    if (!canEditBothTexts) return;
    const tmp = shared.original;
    shared.original = shared.changed;
    shared.changed = tmp;
    if (shared.mode === 'diff') shared.diff = computeDiff(shared.original, shared.changed);
  }

  function loadSample() {
    if (!canEditBothTexts) return;
    shared.original = DEFAULT_ORIGINAL;
    shared.changed = DEFAULT_CHANGED;
    shared.languageIsManual = false;
    if (shared.mode === 'diff') shared.diff = computeDiff(shared.original, shared.changed);
  }

  function clearAll() {
    if (!canEditBothTexts) return;
    shared.original = '';
    shared.changed = '';
    shared.mode = 'edit';
    shared.diff = null;
    shared.showSource = false;
    shared.languageIsManual = false;
  }

  /** Kicks off the lowlight chunk fetch early so it can overlap the user picking a language. */
  async function preloadHighlighter() {
    if (lowlight || highlightLoading) return;
    highlightLoading = true;
    try {
      lowlight = await ensureHighlighter();
    } finally {
      highlightLoading = false;
    }
  }

  /** @param {string} id */
  async function selectLanguage(id) {
    shared.language = id;
    shared.languageIsManual = true;
    if (id !== 'plain') await preloadHighlighter();
  }

  /**
   * Guesses a language from the current text when Find Difference is clicked and the user hasn't
   * picked one manually. Fire-and-forget, same pattern as `preloadHighlighter()`; only ever runs
   * from inside an explicit user action, never from module scope or an effect.
   */
  function autoDetectLanguage() {
    const sample = shared.original || shared.changed;
    if (!sample) return;
    highlightLoading = true;
    ensureHighlighter()
      .then((instance) => {
        lowlight = instance;
        if (shared.languageIsManual) return; // user picked one while the chunk was loading
        const detected = detectLanguage(sample, instance);
        if (detected) shared.language = detected;
      })
      .finally(() => {
        highlightLoading = false;
      });
  }

  let highlightRunsOriginal = $derived.by(() =>
    shared.diff ? highlightLines(shared.diff.originalLines, shared.language, lowlight) : []
  );
  let highlightRunsChanged = $derived.by(() =>
    shared.diff ? highlightLines(shared.diff.changedLines, shared.language, lowlight) : []
  );

  // Precomputed once per (diff, language, highlighter) change - whitespace glyphs are applied at
  // render time, so this doesn't need to re-run when the divider is dragged or the pane layout
  // changes. A collapsed row's placeholder cells carry no line number and no segments, so
  // mergeRuns naturally reduces to an empty span list for them - no special case needed here.
  let renderRows = $derived.by(() => {
    if (!shared.diff) return [];
    const rows = shared.collapseUnchanged ? collapseRows(shared.diff.rows, 3) : shared.diff.rows;
    return rows.map((row) => {
      const { left, right } = row;
      const leftRuns = left.lineNumber !== null ? highlightRunsOriginal[left.lineNumber - 1] : null;
      const rightRuns =
        right.lineNumber !== null ? highlightRunsChanged[right.lineNumber - 1] : null;
      return {
        left: {
          lineNumber: left.lineNumber,
          type: left.type,
          hasEol: left.hasEol,
          spans: mergeRuns(left.segments, leftRuns),
          count: row.count
        },
        right: {
          lineNumber: right.lineNumber,
          type: right.type,
          hasEol: right.hasEol,
          spans: mergeRuns(right.segments, rightRuns),
          count: row.count
        }
      };
    });
  });

  let leftCells = $derived(renderRows.map((r) => r.left));
  let rightCells = $derived(renderRows.map((r) => r.right));

  // The raw-original pane reuses the already-merged left cells (no second diff or highlight
  // pass): only the red/green diff coloring is stripped from each span, so syntax highlighting
  // and structural filler/collapsed rows (which keep all panes aligned and scroll-locked) survive.
  let sourceCells = $derived(
    renderRows.map((r) => {
      const cell = r.left;
      return {
        lineNumber: cell.lineNumber,
        type:
          cell.type === 'added' || cell.type === 'removed'
            ? /** @type {'equal'} */ ('equal')
            : cell.type,
        hasEol: cell.hasEol,
        spans: cell.spans.map((s) => ({ ...s, diff: /** @type {'equal'} */ ('equal') })),
        count: cell.count
      };
    })
  );
</script>

{#snippet originalEditor()}
  <CodeEditorPane
    label="Original"
    bind:value={shared.original}
    bind:wrap={shared.wrap}
    placeholder="Paste the original text here…"
  />
{/snippet}

{#snippet changedEditor()}
  <CodeEditorPane
    label="Changed"
    bind:value={shared.changed}
    bind:wrap={shared.wrap}
    placeholder="Paste the changed text here…"
  />
{/snippet}

{#snippet sourcePane()}
  <DiffPane
    label="Source"
    headerTitle="Original text, no diff highlighting"
    cells={sourceCells}
    {scrollTop}
    {scrollLeft}
    onscroll={onPaneScroll}
    scrollFractionY={crossWindowScrollSync ? shared.scrollFractionY : undefined}
    scrollFractionX={crossWindowScrollSync ? shared.scrollFractionX : undefined}
    onscrollfraction={onPaneScrollFraction}
    wrap={shared.wrap}
    {rowHeights}
    onmeasure={(heights) => onPaneMeasure('source', heights)}
  />
{/snippet}

{#snippet originalDiffPane()}
  <DiffPane
    label="Original"
    cells={leftCells}
    {scrollTop}
    {scrollLeft}
    onscroll={onPaneScroll}
    scrollFractionY={crossWindowScrollSync ? shared.scrollFractionY : undefined}
    scrollFractionX={crossWindowScrollSync ? shared.scrollFractionX : undefined}
    onscrollfraction={onPaneScrollFraction}
    wrap={shared.wrap}
    {rowHeights}
    onmeasure={(heights) => onPaneMeasure('original', heights)}
  />
{/snippet}

{#snippet changedDiffPane()}
  <DiffPane
    label="Changed"
    cells={rightCells}
    {scrollTop}
    {scrollLeft}
    onscroll={onPaneScroll}
    scrollFractionY={crossWindowScrollSync ? shared.scrollFractionY : undefined}
    scrollFractionX={crossWindowScrollSync ? shared.scrollFractionX : undefined}
    onscrollfraction={onPaneScrollFraction}
    wrap={shared.wrap}
    {rowHeights}
    onmeasure={(heights) => onPaneMeasure('changed', heights)}
  />
{/snippet}

{#snippet primary()}
  {#if shared.mode === 'edit'}
    <button
      onclick={runDiff}
      disabled={!canDiff}
      class="rounded-md px-4 py-1.5 text-xs font-semibold transition-colors {canDiff
        ? 'bg-green-600 text-white hover:bg-green-700'
        : 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500'}"
    >
      Find Difference
    </button>
  {:else}
    <button
      onclick={backToEdit}
      class="rounded-md border border-gray-200 px-4 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
    >
      Edit Texts
    </button>
  {/if}
{/snippet}

{#snippet actions()}
  {#if popoutBlockedHint}
    <span class="text-xs text-red-500 dark:text-red-400">Pop-up blocked by the browser</span>
  {/if}
  <select
    value={shared.language}
    onfocus={preloadHighlighter}
    onchange={(e) => selectLanguage(/** @type {HTMLSelectElement} */ (e.currentTarget).value)}
    class="rounded border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
  >
    {#each LANGUAGES as lang (lang.id)}
      <option value={lang.id}>{lang.label}</option>
    {/each}
  </select>
  {#if highlightLoading}
    <span class="text-xs text-gray-400 dark:text-gray-500">Loading…</span>
  {/if}

  {#if shared.mode === 'diff'}
    <button
      onclick={() => (shared.wrap = !shared.wrap)}
      aria-pressed={shared.wrap}
      title="Wrap long lines"
      class="rounded px-2 py-1 text-xs font-medium transition-colors {shared.wrap
        ? 'bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-100'
        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100'}"
    >
      Wrap
    </button>
    <button
      onclick={() => (shared.collapseUnchanged = !shared.collapseUnchanged)}
      aria-pressed={shared.collapseUnchanged}
      class="rounded px-2 py-1 text-xs font-medium transition-colors {shared.collapseUnchanged
        ? 'bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-100'
        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100'}"
    >
      Collapse unchanged
    </button>
  {/if}

  <button
    onclick={swapTexts}
    disabled={!canEditBothTexts}
    title="Swap the Original and Changed text"
    class="rounded px-2 py-1 text-xs font-medium transition-colors {canEditBothTexts
      ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100'
      : 'cursor-not-allowed text-gray-300 dark:text-gray-600'}"
  >
    Swap texts
  </button>
  <button
    onclick={loadSample}
    disabled={!canEditBothTexts}
    class="rounded px-2 py-1 text-xs font-medium transition-colors {canEditBothTexts
      ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100'
      : 'cursor-not-allowed text-gray-300 dark:text-gray-600'}"
  >
    Sample
  </button>
  <button
    onclick={clearAll}
    disabled={!canEditBothTexts}
    class="rounded px-2 py-1 text-xs font-medium transition-colors {canEditBothTexts
      ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100'
      : 'cursor-not-allowed text-gray-300 dark:text-gray-600'}"
  >
    Clear
  </button>

  {#if shared.mode === 'diff'}
    <button
      onclick={() => (shared.showSource = !shared.showSource)}
      aria-pressed={shared.showSource}
      title="Show the original text with no diff highlighting, as a third pane"
      class="rounded px-2 py-1 text-xs font-medium transition-colors {shared.showSource
        ? 'bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-100'
        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100'}"
    >
      Source pane
    </button>
  {/if}
{/snippet}

{#snippet status()}
  {#if shared.mode === 'edit'}
    {shared.original.split('\n').length} / {shared.changed.split('\n').length} lines
  {:else if shared.diff}
    {#if shared.diff.stats.tooLarge}
      Input is too large to diff (over 2,000,000 characters combined).
    {:else if shared.diff.stats.identical}
      Texts are identical.
    {:else}
      +{shared.diff.stats.linesAdded} −{shared.diff.stats.linesRemoved} lines · +{shared.diff.stats
        .charsAdded} −{shared.diff.stats.charsRemoved} characters
      {#if shared.diff.stats.eolMismatch}
        · line endings differ
      {/if}
      {#if shared.diff.stats.trailingNewline.original !== shared.diff.stats.trailingNewline.changed}
        · trailing newline differs
      {/if}
      {#if shared.diff.stats.aborted}
        · diff was too complex and was simplified
      {/if}
    {/if}
  {/if}
{/snippet}

{#if isSatellite}
  <div class="flex h-full flex-col">
    <PopoutSatelliteBar
      label={satellitePaneLabel}
      {connected}
      onreturn={() => sync?.returnHome()}
    />
    {#if satellitePaneId === 'source'}
      {#if shared.mode === 'diff' && shared.diff}
        {@render sourcePane()}
      {:else}
        <p class="p-4 text-sm text-gray-500 dark:text-gray-400">
          The Source pane is only available in the diff view.
        </p>
      {/if}
    {:else if shared.mode === 'edit'}
      {#if satellitePaneId === 'original'}
        {@render originalEditor()}
      {:else}
        {@render changedEditor()}
      {/if}
    {:else if shared.diff}
      {#if satellitePaneId === 'original'}
        {@render originalDiffPane()}
      {:else}
        {@render changedDiffPane()}
      {/if}
    {:else}
      <p class="p-4 text-sm text-gray-500 dark:text-gray-400">Waiting for the diff…</p>
    {/if}
  </div>
{:else}
  <DiffLayout
    panes={(shared.mode === 'edit'
      ? [
          { id: 'original', label: 'Original', render: originalEditor },
          { id: 'changed', label: 'Changed', render: changedEditor }
        ]
      : [
          ...(shared.showSource ? [{ id: 'source', label: 'Source', render: sourcePane }] : []),
          { id: 'original', label: 'Original', render: originalDiffPane },
          { id: 'changed', label: 'Changed', render: changedDiffPane }
        ]
    ).filter((p) => !poppedIds.includes(p.id))}
    onpopout={(id) => sync?.requestPopout(id)}
    {primary}
    {actions}
    {status}
  />
{/if}
