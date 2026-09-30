<script>
  import MetadataList from './MetadataList.svelte';

  /**
   * Trajectory-level details that don't belong to any one step: schema/session/agent identity,
   * headline metrics, and whatever else the log carries at the top level or on the agent (shown
   * as metadata trees so an unknown field is never dropped). Renders its own trigger button and
   * modal; renders nothing when the trajectory has no such details.
   */

  /**
   * @typedef {Object} TrajectoryInfoProps
   * @property {import('$lib/agent-trajectory.js').Trajectory | null} trajectory
   */

  /** @type {TrajectoryInfoProps} */
  let { trajectory } = $props();

  let open = $state(false);
  /** @type {HTMLDialogElement | null} */
  let dialogEl = $state(null);

  let identity = $derived(
    trajectory
      ? [
          ['Schema version', trajectory.schemaVersion],
          ['Session', trajectory.sessionId],
          ['Agent', trajectory.agent.name],
          ['Agent version', trajectory.agent.version],
          ['Model', trajectory.agent.modelName]
        ].filter(([, value]) => value)
      : []
  );

  let hasContent = $derived(
    !!trajectory &&
      (identity.length > 0 ||
        trajectory.finalMetrics.length > 0 ||
        trajectory.agent.metadata.length > 0 ||
        trajectory.metadata.length > 0)
  );

  $effect(() => {
    if (!dialogEl) return;
    if (open && !dialogEl.open) dialogEl.showModal();
    else if (!open && dialogEl.open) dialogEl.close();
  });
</script>

{#if trajectory && hasContent}
  <button
    onclick={() => (open = true)}
    class="rounded px-2 py-1 text-[1em] font-medium whitespace-nowrap text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
  >
    Info
  </button>

  <dialog
    bind:this={dialogEl}
    onclose={() => (open = false)}
    aria-label="Trajectory info"
    class="fixed inset-0 m-auto max-h-[85vh] w-full max-w-3xl rounded-lg bg-white p-0 shadow-xl backdrop:bg-black/50 dark:bg-gray-800"
  >
    <div class="flex max-h-[85vh] flex-col p-6">
      <h3 class="mb-4 text-xl font-bold text-gray-900 dark:text-gray-100">Trajectory info</h3>
      <div class="min-h-0 flex-1 space-y-4 overflow-y-auto">
        {#if identity.length > 0}
          <dl class="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-[1em]">
            {#each identity as [label, value] (label)}
              <dt class="text-gray-500 dark:text-gray-400">{label}</dt>
              <dd class="font-mono break-all text-gray-900 dark:text-gray-100">{value}</dd>
            {/each}
          </dl>
        {/if}
        {#if trajectory.finalMetrics.length > 0}
          <dl class="grid grid-cols-2 gap-2 text-[1em] sm:grid-cols-4">
            {#each trajectory.finalMetrics as metric (metric.key)}
              <div class="rounded border border-gray-200 p-2 dark:border-gray-700">
                <dt class="text-gray-500 dark:text-gray-400">{metric.key}</dt>
                <dd class="font-mono font-semibold text-gray-900 dark:text-gray-100">
                  {metric.display}
                </dd>
              </div>
            {/each}
          </dl>
        {/if}
        <MetadataList entries={trajectory.agent.metadata} title="Agent metadata" />
        <MetadataList entries={trajectory.metadata} title="Trajectory metadata" />
      </div>
      <div class="mt-4 flex justify-end">
        <button
          onclick={() => (open = false)}
          class="rounded-lg bg-gray-200 px-4 py-2 font-semibold text-gray-700 transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
        >
          Close
        </button>
      </div>
    </div>
  </dialog>
{/if}
