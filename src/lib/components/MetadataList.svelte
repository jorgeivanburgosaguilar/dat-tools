<script>
  /**
   * Generic key/value renderer for the `MetadataEntry[]` lists `collectMetadata()` produces -
   * the fallback view for any field the trajectory normalizer doesn't recognize. Used at every
   * level (trajectory, agent, step, tool call, observation) so a schema change never makes data
   * disappear, only downgrades it to a plain row here.
   */

  /**
   * @typedef {Object} MetadataListProps
   * @property {import('$lib/agent-trajectory.js').MetadataEntry[]} entries
   * @property {string} [title]
   */

  /** @type {MetadataListProps} */
  let { entries, title = 'Metadata' } = $props();
</script>

{#if entries.length > 0}
  <div class="space-y-1">
    <h3 class="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
      {title}
    </h3>
    <dl
      class="divide-y divide-gray-100 rounded border border-gray-200 text-xs dark:divide-gray-800 dark:border-gray-700"
    >
      {#each entries as entry (entry.path)}
        <div class="flex flex-col gap-0.5 px-2 py-1.5 sm:flex-row sm:items-start sm:gap-3">
          <dt class="shrink-0 font-mono text-gray-500 sm:w-40 dark:text-gray-400">{entry.path}</dt>
          <dd
            class="min-w-0 flex-1 font-mono break-words text-gray-900 dark:text-gray-100 {entry.isJson
              ? 'whitespace-pre-wrap'
              : ''}"
          >
            {entry.value}
          </dd>
        </div>
      {/each}
    </dl>
  </div>
{/if}
