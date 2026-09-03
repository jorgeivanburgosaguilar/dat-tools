<script>
  import { untrack } from 'svelte';
  import { highlightLines } from '$lib/syntax-highlight.js';
  import { loadWrapPreference, saveWrapPreference } from '$lib/wrap-preference.js';

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
  let lineNumbers = $derived(Array.from({ length: highlighted.length }, (_, i) => i + 1));

  // Seeded from the last choice made in any code block across the viewer, and kept in sync with
  // it - there's no single parent state for every block (they're scattered across a step's tool
  // calls, observations, and Raw JSON) to bind a shared toggle to.
  let wrap = $state(untrack(() => loadWrapPreference('agent-trajectory-viewer')));

  $effect(() => {
    saveWrapPreference('agent-trajectory-viewer', wrap);
  });

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
    <div class="flex shrink-0 items-center gap-1">
      <button
        type="button"
        onclick={() => (wrap = !wrap)}
        aria-pressed={wrap}
        title="Wrap long lines"
        class="rounded px-2 py-0.5 text-xs font-medium transition-colors {wrap
          ? 'bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-gray-100'
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100'}"
      >
        Wrap
      </button>
      <button
        onclick={copy}
        class="rounded px-2 py-0.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
      >
        {copied ? '✓ Copied' : 'Copy'}
      </button>
    </div>
  </div>
  <!-- One overflow-x-auto scroller shared by both columns (rather than DiffPane's two
       separately-scrolled, JS-synced elements) so the gutter can simply `sticky` in place -
       no scroll-event wiring needed for a read-only, single-pane view like this one. -->
  <div class="overflow-x-auto bg-white dark:bg-gray-900">
    <div
      class="grid grid-cols-[auto_1fr] gap-x-3 py-3 font-mono text-xs leading-5 {wrap
        ? 'w-full'
        : 'w-max'}"
    >
      {#each highlighted as runs, i (i)}
        <div
          class="sticky left-0 bg-white pr-1 pl-3 text-right text-gray-400 select-none dark:bg-gray-900 dark:text-gray-500"
        >
          {lineNumbers[i]}
        </div>
        <div class="pr-3 {wrap ? 'min-w-0 break-words whitespace-pre-wrap' : 'whitespace-pre'}">
          {#each runs as run, j (j)}<span class={run.className ?? undefined}>{run.text}</span
            >{/each}{#if runs.length === 0}&nbsp;{/if}
        </div>
      {/each}
    </div>
  </div>
</div>
