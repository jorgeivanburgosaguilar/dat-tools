<script>
  import { deltaMs, formatDelta, stepSummary } from '$lib/agent-trajectory.js';

  /**
   * @typedef {Object} TrajectoryStepListProps
   * @property {import('$lib/agent-trajectory.js').TrajectoryStep[]} steps - Full, unfiltered list.
   * @property {number} selectedIndex
   * @property {number[]} visibleIndices - Indices into `steps` that pass the active filters.
   * @property {(index: number) => void} [onselect]
   */

  /** @type {TrajectoryStepListProps} */
  let { steps, selectedIndex, visibleIndices, onselect = () => {} } = $props();

  /** @type {HTMLDivElement | null} */
  let listEl = $state(null);

  const SOURCE_STYLES = /** @type {Record<string, string>} */ ({
    user: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
    agent: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300'
  });

  /** @param {string} source */
  function sourceClass(source) {
    return SOURCE_STYLES[source] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  }

  /**
   * @param {import('$lib/agent-trajectory.js').TrajectoryStep} step
   */
  function stepBorderClass(step) {
    if (step.source === 'user') return 'border-l-4 border-l-blue-500';
    if (step.level === 'err') return 'border-l-4 border-l-red-500';
    if (step.level === 'warn') return 'border-l-4 border-l-amber-500';
    if (step.isTaskComplete) return 'border-l-4 border-l-emerald-500';
    return 'border-l-4 border-l-transparent';
  }

  /**
   * Roving selection over the currently visible (filtered) steps only, so arrow/j-k navigation
   * never lands on a hidden row. Keys are handled on the list container, not module-wide, so
   * typing in the search box is unaffected.
   * @param {KeyboardEvent} e
   */
  function onKeydown(e) {
    if (visibleIndices.length === 0) return;
    const pos = visibleIndices.indexOf(selectedIndex);

    /** @param {number} nextPos */
    const moveTo = (nextPos) => {
      e.preventDefault();
      const clamped = Math.min(Math.max(nextPos, 0), visibleIndices.length - 1);
      onselect(visibleIndices[clamped]);
    };

    switch (e.key) {
      case 'ArrowDown':
      case 'j':
        moveTo(pos === -1 ? 0 : pos + 1);
        break;
      case 'ArrowUp':
      case 'k':
        moveTo(pos === -1 ? visibleIndices.length - 1 : pos - 1);
        break;
      case 'Home':
        moveTo(0);
        break;
      case 'End':
        moveTo(visibleIndices.length - 1);
        break;
    }
  }

  $effect(() => {
    selectedIndex;
    listEl
      ?.querySelector(`[data-step-index="${selectedIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  });
</script>

<div
  bind:this={listEl}
  role="listbox"
  aria-label="Trajectory steps"
  aria-activedescendant={`trajectory-step-${selectedIndex}`}
  tabindex="0"
  onkeydown={onKeydown}
  class="flex-1 overflow-y-auto outline-none"
>
  {#each visibleIndices as index (index)}
    {@const step = steps[index]}
    {@const prevStep = index > 0 ? steps[index - 1] : null}
    {@const delta = formatDelta(deltaMs(prevStep?.timestamp ?? null, step.timestamp))}
    <button
      id={`trajectory-step-${index}`}
      data-step-index={index}
      role="option"
      aria-selected={index === selectedIndex}
      onclick={() => onselect(index)}
      class="flex w-full min-w-0 flex-col gap-0.5 border-b border-gray-100 px-3 py-2 text-left text-[1em] transition-colors dark:border-gray-800 {stepBorderClass(
        step
      )} {index === selectedIndex
        ? 'bg-blue-50 dark:bg-blue-950/40'
        : 'hover:bg-gray-50 dark:hover:bg-gray-800/60'}"
    >
      <span class="flex min-w-0 flex-wrap items-center gap-2">
        <span class="font-mono font-semibold text-gray-400 dark:text-gray-500">#{step.stepId}</span>
        <span class="rounded px-1.5 py-0.5 font-medium {sourceClass(step.source)}"
          >{step.source}</span
        >
        {#if step.source !== 'user'}
          {#if step.level === 'err'}
            <span
              class="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-700 dark:bg-red-900/50 dark:text-red-300"
              >error</span
            >
          {:else if step.level === 'warn'}
            <span
              class="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"
              >warning</span
            >
          {/if}
          {#if step.isTaskComplete}
            <span
              class="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
              >complete</span
            >
          {/if}
        {/if}
        {#if delta}<span class="font-mono text-gray-400 dark:text-gray-500">{delta}</span>{/if}
        {#if step.toolCalls.length > 0}
          <span class="min-w-0 truncate font-mono text-gray-400 dark:text-gray-500"
            >&#x1F527; {step.toolCalls.map((tc) => tc.functionName).join(', ')}</span
          >
        {/if}
      </span>
      <span class="line-clamp-2 text-gray-700 dark:text-gray-300">{stepSummary(step)}</span>
    </button>
  {/each}
  {#if visibleIndices.length === 0}
    <p class="p-4 text-center text-[1em] text-gray-400 dark:text-gray-500">
      No steps match the current filters.
    </p>
  {/if}
</div>
