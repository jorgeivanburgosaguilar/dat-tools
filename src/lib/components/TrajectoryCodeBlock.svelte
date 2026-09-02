<script>
  import { highlightLines } from '$lib/syntax-highlight.js';

  /**
   * @typedef {Object} TrajectoryCodeBlockProps
   * @property {string} label
   * @property {string} code
   * @property {string} [language]
   * @property {import('$lib/syntax-highlight.js').Lowlight | null} [lowlight]
   */

  /** @type {TrajectoryCodeBlockProps} */
  let { label, code, language = 'plain', lowlight = null } = $props();

  let highlighted = $derived(highlightLines(code.split('\n'), language, lowlight));

  let copied = $state(false);
  /** @type {ReturnType<typeof setTimeout> | null} */
  let copyTimeout = null;

  async function copy() {
    await navigator.clipboard.writeText(code);
    copied = true;
    if (copyTimeout) clearTimeout(copyTimeout);
    copyTimeout = setTimeout(() => (copied = false), 1500);
  }
</script>

<div class="overflow-hidden rounded border border-gray-200 dark:border-gray-700">
  <div
    class="flex items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-3 py-1.5 dark:border-gray-700 dark:bg-gray-800"
  >
    <span class="truncate font-mono text-xs font-semibold text-gray-500 dark:text-gray-400"
      >{label}</span
    >
    <button
      onclick={copy}
      class="shrink-0 rounded px-2 py-0.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  </div>
  <div class="overflow-x-auto bg-white p-3 dark:bg-gray-900">
    <div class="min-w-max font-mono text-xs leading-5">
      {#each highlighted as runs, i (i)}
        <div class="whitespace-pre">
          {#each runs as run, j (j)}<span class={run.className ?? undefined}>{run.text}</span
            >{/each}{#if runs.length === 0}&nbsp;{/if}
        </div>
      {/each}
    </div>
  </div>
</div>
