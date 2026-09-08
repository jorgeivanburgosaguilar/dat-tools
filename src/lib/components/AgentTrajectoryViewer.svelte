<script>
  import { onMount } from 'svelte';
  import DiffLayout from './DiffLayout.svelte';
  import TrajectoryLoader from './TrajectoryLoader.svelte';
  import TrajectoryStepList from './TrajectoryStepList.svelte';
  import TrajectoryStepDetail from './TrajectoryStepDetail.svelte';
  import PopoutSatelliteBar from './PopoutSatelliteBar.svelte';
  import { createPopoutSync } from '$lib/popout-sync.js';
  import { trajectoryStats, buildSearchIndex, filterSteps } from '$lib/agent-trajectory.js';
  import { ensureHighlighter } from '$lib/syntax-highlight.js';

  const TOOL = 'agent-trajectory-viewer';

  /**
   * @typedef {Object} AgentTrajectoryViewerProps
   * @property {(satellite: boolean, paneLabel?: string) => void} [onsatellite] - Fired once this
   *   window's role is known, so the route page can hide its "Back to Tools" header chrome in a
   *   satellite window and title the window/tab after the pane it's showing.
   */

  /** @type {AgentTrajectoryViewerProps} */
  let { onsatellite = () => {} } = $props();

  // Grouped into one $state object so `applyPatch` from `popout.js` can mutate it directly by key.
  // `trajectory` is shipped whole (see the dedicated $effect below) rather than recomputed by a
  // satellite, since it's the *source* data, not something pure to derive from anything smaller -
  // unlike Diff Checker's `diff`, nothing here has a non-deterministic recompute to avoid; this is
  // the same "ship data, not inputs" reasoning applied to a different kind of value. Both the
  // 'steps' and 'detail' satellites receive the full trajectory rather than a pane-specific slice
  // (the plan's original aspiration) because the sync engine's handshake always sends the whole
  // `shared` snapshot to whichever pane asks - splitting that would mean widening `popout-sync.js`
  // itself, which no other tool needs. Trajectory logs are modest JSON, not the multi-MB case that
  // would make this worth doing.
  let shared = $state({
    trajectory: /** @type {import('$lib/agent-trajectory.js').Trajectory | null} */ (null),
    selectedIndex: 0,
    query: '',
    sourceFilter: 'all',
    toolFilter: 'all'
  });

  // Not structured-cloneable, so never part of `shared` - a satellite loads its own instance (see
  // the effect below).
  /** @type {import('$lib/syntax-highlight.js').Lowlight | null} */
  let lowlight = $state(null);
  let highlightLoading = $state(false);

  // --- Pop-out sync -----------------------------------------------------------------------------

  /** @type {ReturnType<typeof createPopoutSync> | null} */
  let sync = null;
  let syncReady = $state(false);
  // Set from `sync.isSatelliteRequest` as soon as `sync` exists - see popout-sync.js's doc comment
  // on why ownership checks must gate on this, not merely on `isSatellite`.
  let isSatelliteRequest = $state(false);

  /** Owner only: pane ids ('steps' | 'detail') currently confirmed popped out. */
  let poppedIds = $state(/** @type {string[]} */ ([]));
  /** Whether the owner's handshake reply has arrived and this window is showing just one pane. */
  let isSatellite = $state(false);
  /** Satellite only: which pane this window is showing. */
  let satellitePaneId = $state(/** @type {'steps' | 'detail' | null} */ (null));
  /** Satellite only: whether the owner window is currently reachable. */
  let connected = $state(false);
  let popoutBlockedHint = $state(false);

  let canSend = $derived(syncReady && (isSatelliteRequest ? isSatellite : true));
  let isOwnerWindow = $derived(syncReady && !isSatelliteRequest);
  let satellitePaneLabel = $derived(satellitePaneId === 'steps' ? 'Steps' : 'Detail');

  // Unlike the other three tools, neither synced value here is *editable* text tied to one
  // specific pane - the step list and the detail view are both read-only displays over the same
  // shared selection/search state. Only the window currently hosting the Steps pane ever renders
  // the controls that write `selectedIndex`/`query`/the filters (the search box and the step list
  // itself both live inside the Steps pane's own markup), so a plain `canSend` gate is enough:
  // the other window's own effect, if it fires at all, only ever re-broadcasts a value it just
  // *received* - which `applyPatch`'s `===` skip already turns into a no-op, without needing a
  // `hostsPane()`-style per-pane write guard the way Markdown/JSON/Diff's *editable* panes do.
  $effect(() => {
    if (!isOwnerWindow) return;
    sync?.send({ trajectory: shared.trajectory });
  });
  $effect(() => {
    if (!canSend) return;
    sync?.send({
      selectedIndex: shared.selectedIndex,
      query: shared.query,
      sourceFilter: shared.sourceFilter,
      toolFilter: shared.toolFilter
    });
  });

  // A satellite needs its own highlighter instance for TrajectoryStepDetail's code blocks -
  // `lowlight` isn't structured-cloneable, so it can never be part of `shared`. Only ever runs
  // post-handshake in a real browser, never during SvelteKit's prerender pass.
  $effect(() => {
    if (!isSatellite || !shared.trajectory || lowlight || highlightLoading) return;
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
          satellitePaneId = /** @type {'steps' | 'detail'} */ (paneId);
          onsatellite(true, paneId === 'steps' ? 'Steps' : 'Detail');
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

  // .by(() => ...) rather than bare $derived(...) for anything beyond a trivial expression -
  // matches DiffChecker.svelte's convention, and keeps narrowing on `shared.trajectory` (a
  // nullable $state property) working as plain TS control flow inside a real function body. Pure
  // functions of `shared.*`, so both the owner and either satellite compute identical results
  // independently - nothing beyond `trajectory`/`selectedIndex`/`query`/the filters ever needs to
  // travel over the channel.
  let stats = $derived.by(() => (shared.trajectory ? trajectoryStats(shared.trajectory) : null));
  let searchIndex = $derived.by(() =>
    shared.trajectory ? buildSearchIndex(shared.trajectory.steps) : []
  );
  let visibleIndices = $derived.by(() =>
    shared.trajectory
      ? filterSteps(shared.trajectory.steps, searchIndex, {
          query: shared.query,
          source: shared.sourceFilter,
          tool: shared.toolFilter
        })
      : []
  );
  // If a filter change hides the currently-selected step, the *effective* selection follows to
  // the first still-visible one, without ever writing back into `shared.selectedIndex` itself -
  // clicking a row or pressing j/k always sets the real selection directly, so there's no derived-
  // vs-effect tug-of-war over who owns it.
  let effectiveSelectedIndex = $derived.by(() =>
    visibleIndices.includes(shared.selectedIndex)
      ? shared.selectedIndex
      : (visibleIndices[0] ?? shared.selectedIndex)
  );
  let selectedStep = $derived.by(() => shared.trajectory?.steps[effectiveSelectedIndex] ?? null);

  /** @param {import('$lib/agent-trajectory.js').TrajectoryLoadResult} result */
  function handleLoad(result) {
    shared.trajectory = result.trajectory;
    lowlight = result.lowlight;
    shared.selectedIndex = 0;
    shared.query = '';
    shared.sourceFilter = 'all';
    shared.toolFilter = 'all';
  }

  function reset() {
    shared.trajectory = null;
    shared.selectedIndex = 0;
    lowlight = null;
  }
</script>

{#snippet stepsPane()}
  <div class="flex h-full flex-col">
    <div class="border-b border-gray-200 px-3 py-2 dark:border-gray-700">
      <span
        class="text-[1em] font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400"
        >Steps</span
      >
    </div>
    <TrajectoryStepList
      steps={shared.trajectory?.steps ?? []}
      selectedIndex={effectiveSelectedIndex}
      {visibleIndices}
      onselect={(i) => (shared.selectedIndex = i)}
    />
  </div>
{/snippet}

{#snippet detailPane()}
  <div class="flex h-full flex-col">
    <div class="border-b border-gray-200 px-3 py-2 dark:border-gray-700">
      <span
        class="text-[1em] font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400"
        >Step Detail</span
      >
    </div>
    <TrajectoryStepDetail step={selectedStep} {lowlight} />
  </div>
{/snippet}

{#snippet searchAndFilters()}
  <input
    type="search"
    placeholder="Search steps..."
    bind:value={shared.query}
    class="w-36 rounded border border-gray-200 bg-white px-2 py-1 text-[1em] text-gray-900 outline-none focus:border-blue-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
  />
  <select
    bind:value={shared.sourceFilter}
    class="rounded border border-gray-200 bg-white px-1.5 py-1 text-[1em] text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
  >
    <option value="all">All sources</option>
    {#each Object.keys(stats?.bySource ?? {}) as source (source)}
      <option value={source}>{source}</option>
    {/each}
  </select>
  <select
    bind:value={shared.toolFilter}
    class="rounded border border-gray-200 bg-white px-1.5 py-1 text-[1em] text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
  >
    <option value="all">All tools</option>
    {#each stats?.tools ?? [] as tool (tool)}
      <option value={tool}>{tool}</option>
    {/each}
  </select>
{/snippet}

{#snippet actions()}
  {#if popoutBlockedHint}
    <span class="text-[1em] text-red-500 dark:text-red-400">Pop-up blocked by the browser</span>
  {/if}
  {@render searchAndFilters()}
  <button
    onclick={reset}
    class="rounded px-2 py-1 text-[1em] font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
  >
    New JSON
  </button>
{/snippet}

{#snippet status()}
  {#if shared.trajectory}
    <span class="text-[1em]">
      Showing {visibleIndices.length} of {shared.trajectory.steps.length} steps
      {#if stats && stats.totals.length > 0}
        &middot;
        {#each stats.totals as t, i (t.key)}{i > 0 ? ' · ' : ''}{t.key}: {t.display}{/each}
      {/if}
    </span>
  {/if}
{/snippet}

{#if isSatellite}
  <div class="flex h-full flex-col">
    <PopoutSatelliteBar
      label={satellitePaneLabel}
      {connected}
      actions={satellitePaneId === 'steps' ? searchAndFilters : undefined}
      onreturn={() => sync?.returnHome()}
    />
    {#if !shared.trajectory}
      <!-- New JSON (which writes `trajectory`) is owner-only, so a satellite that outlives the
           owner's reset just waits rather than offering its own (nonexistent) loader. -->
      <p class="p-4 text-[1.125em] text-gray-500 dark:text-gray-400">
        Waiting for the main window to load a trajectory…
      </p>
    {:else if satellitePaneId === 'steps'}
      {@render stepsPane()}
    {:else}
      {@render detailPane()}
    {/if}
  </div>
{:else if !shared.trajectory}
  <TrajectoryLoader onload={handleLoad} />
{:else}
  <DiffLayout
    panes={[
      { id: 'detail', label: 'Detail', render: detailPane },
      { id: 'steps', label: 'Steps', render: stepsPane }
    ].filter((p) => !poppedIds.includes(p.id))}
    onpopout={(id) => sync?.requestPopout(id)}
    {actions}
    {status}
  />
{/if}
