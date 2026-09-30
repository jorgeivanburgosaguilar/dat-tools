<script>
  import { metadataTree } from '$lib/agent-trajectory.js';

  /**
   * Generic key/value renderer for the `MetadataEntry[]` lists `collectMetadata()` produces -
   * the fallback view for any field the trajectory normalizer doesn't recognize. Used at every
   * level (trajectory, agent, step, tool call, observation) so a schema change never makes data
   * disappear, only downgrades it to a plain row here. Dotted paths are regrouped into a tree:
   * nested data shows as expanded-by-default accordions, top-level scalars as plain rows.
   */

  /**
   * @typedef {Object} MetadataListProps
   * @property {import('$lib/agent-trajectory.js').MetadataEntry[]} entries
   * @property {string} [title]
   */

  /** @type {MetadataListProps} */
  let { entries, title = 'Metadata' } = $props();

  let nodes = $derived(metadataTree(entries));
</script>

{#snippet row(
  /** @type {import('$lib/agent-trajectory.js').MetadataEntry} */ entry,
  /** @type {string} */ label
)}
  <div class="flex flex-col gap-0.5 px-2 py-1.5 sm:flex-row sm:items-start sm:gap-3">
    <dt class="shrink-0 font-mono text-gray-500 sm:w-40 dark:text-gray-400">{label}</dt>
    <dd
      class="min-w-0 flex-1 font-mono break-words text-gray-900 dark:text-gray-100 {entry.isJson
        ? 'whitespace-pre-wrap'
        : ''}"
    >
      {entry.value}
    </dd>
  </div>
{/snippet}

{#snippet group(/** @type {import('$lib/agent-trajectory.js').MetadataNode[]} */ items)}
  {#each items as node (node.path)}
    {#if node.children.length === 0 && node.entry}
      {@render row(node.entry, node.key)}
    {:else}
      <div class="px-2 py-1.5">
        <details open data-testid="metadata-group">
          <summary class="cursor-pointer font-mono text-gray-500 dark:text-gray-400">
            {node.key}
          </summary>
          <dl
            class="mt-1 ml-2 divide-y divide-gray-100 border-l border-gray-200 dark:divide-gray-800 dark:border-gray-700"
          >
            {#if node.entry}
              {@render row(node.entry, node.key)}
            {/if}
            {@render group(node.children)}
          </dl>
        </details>
      </div>
    {/if}
  {/each}
{/snippet}

{#if entries.length > 0}
  <div class="space-y-1">
    <h3 class="text-[1em] font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
      {title}
    </h3>
    <dl
      class="divide-y divide-gray-100 rounded border border-gray-200 text-[1em] dark:divide-gray-800 dark:border-gray-700"
    >
      {@render group(nodes)}
    </dl>
  </div>
{/if}
