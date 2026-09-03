<script>
  import DiffLayout from './DiffLayout.svelte';
  import TrajectoryLoader from './TrajectoryLoader.svelte';
  import TrajectoryStepList from './TrajectoryStepList.svelte';
  import TrajectoryStepDetail from './TrajectoryStepDetail.svelte';
  import { trajectoryStats, buildSearchIndex, filterSteps } from '$lib/agent-trajectory.js';

  /** @type {import('$lib/agent-trajectory.js').Trajectory | null} */
  let trajectory = $state(null);
  /** @type {import('$lib/syntax-highlight.js').Lowlight | null} */
  let lowlight = $state(null);

  let selectedIndex = $state(0);
  let query = $state('');
  let sourceFilter = $state('all');
  let toolFilter = $state('all');

  // .by(() => ...) rather than bare $derived(...) for anything beyond a trivial expression -
  // matches DiffChecker.svelte's convention, and keeps narrowing on `trajectory` (a nullable
  // $state) working as plain TS control flow inside a real function body.
  let stats = $derived.by(() => (trajectory ? trajectoryStats(trajectory) : null));
  let searchIndex = $derived.by(() => (trajectory ? buildSearchIndex(trajectory.steps) : []));
  let visibleIndices = $derived.by(() =>
    trajectory
      ? filterSteps(trajectory.steps, searchIndex, {
          query,
          source: sourceFilter,
          tool: toolFilter
        })
      : []
  );
  // If a filter change hides the currently-selected step, the *effective* selection follows to
  // the first still-visible one, without ever writing back into `selectedIndex` itself - clicking
  // a row or pressing j/k always sets the real selection directly, so there's no derived-vs-effect
  // tug-of-war over who owns it.
  let effectiveSelectedIndex = $derived.by(() =>
    visibleIndices.includes(selectedIndex) ? selectedIndex : (visibleIndices[0] ?? selectedIndex)
  );
  let selectedStep = $derived.by(() => trajectory?.steps[effectiveSelectedIndex] ?? null);

  /** @param {import('$lib/agent-trajectory.js').TrajectoryLoadResult} result */
  function handleLoad(result) {
    trajectory = result.trajectory;
    lowlight = result.lowlight;
    selectedIndex = 0;
    query = '';
    sourceFilter = 'all';
    toolFilter = 'all';
  }

  function reset() {
    trajectory = null;
    lowlight = null;
    selectedIndex = 0;
  }
</script>

{#snippet stepsPane()}
  <div class="flex h-full flex-col">
    <div class="border-b border-gray-200 px-3 py-2 dark:border-gray-700">
      <span class="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400"
        >Steps</span
      >
    </div>
    <TrajectoryStepList
      steps={trajectory?.steps ?? []}
      selectedIndex={effectiveSelectedIndex}
      {visibleIndices}
      onselect={(i) => (selectedIndex = i)}
    />
  </div>
{/snippet}

{#snippet detailPane()}
  <div class="flex h-full flex-col">
    <div class="border-b border-gray-200 px-3 py-2 dark:border-gray-700">
      <span class="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400"
        >Step Detail</span
      >
    </div>
    <TrajectoryStepDetail step={selectedStep} {lowlight} />
  </div>
{/snippet}

{#snippet actions()}
  <input
    type="search"
    placeholder="Search steps..."
    bind:value={query}
    class="w-36 rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-900 outline-none focus:border-blue-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
  />
  <select
    bind:value={sourceFilter}
    class="rounded border border-gray-200 bg-white px-1.5 py-1 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
  >
    <option value="all">All sources</option>
    {#each Object.keys(stats?.bySource ?? {}) as source (source)}
      <option value={source}>{source}</option>
    {/each}
  </select>
  <select
    bind:value={toolFilter}
    class="rounded border border-gray-200 bg-white px-1.5 py-1 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
  >
    <option value="all">All tools</option>
    {#each stats?.tools ?? [] as tool (tool)}
      <option value={tool}>{tool}</option>
    {/each}
  </select>
  <button
    onclick={reset}
    class="rounded px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
  >
    New JSON
  </button>
{/snippet}

{#snippet status()}
  {#if trajectory}
    Showing {visibleIndices.length} of {trajectory.steps.length} steps
    {#if stats && stats.totals.length > 0}
      &middot;
      {#each stats.totals as t, i (t.key)}{i > 0 ? ' · ' : ''}{t.key}: {t.display}{/each}
    {/if}
  {/if}
{/snippet}

{#if !trajectory}
  <TrajectoryLoader onload={handleLoad} />
{:else}
  <DiffLayout
    panes={[
      { id: 'steps', label: 'Steps', render: stepsPane },
      { id: 'detail', label: 'Detail', render: detailPane }
    ]}
    {actions}
    {status}
  />
{/if}
