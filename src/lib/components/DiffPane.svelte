<script>
  import { toWhitespaceChunks } from '$lib/diff-render.js';

  /**
   * @typedef {Object} DiffRenderCell
   * @property {number | null} lineNumber
   * @property {'equal' | 'added' | 'removed' | 'filler' | 'collapsed'} type
   * @property {boolean} hasEol
   * @property {import('$lib/diff-render.js').MergedSpan[]} spans
   * @property {number} [count] - Present only when type is 'collapsed'.
   */

  /**
   * @typedef {Object} DiffPaneProps
   * @property {string} label
   * @property {DiffRenderCell[]} cells - One entry per diff row, already merged with syntax runs.
   * @property {string} [headerTitle] - Optional tooltip on the label, e.g. to explain a pane's role.
   * @property {number} [scrollTop]
   * @property {number} [scrollLeft]
   * @property {(scrollTop: number, scrollLeft: number) => void} [onscroll]
   */

  /** @type {DiffPaneProps} */
  let {
    label,
    cells,
    headerTitle = undefined,
    scrollTop = 0,
    scrollLeft = 0,
    onscroll = () => {}
  } = $props();

  /** @type {HTMLDivElement | null} */
  let scrollEl = $state(null);
  /** @type {HTMLDivElement | null} */
  let gutterEl = $state(null);

  /** @param {DiffRenderCell} cell */
  function rowTint(cell) {
    if (cell.type === 'added') return 'diff-line-added';
    if (cell.type === 'removed') return 'diff-line-removed';
    if (cell.type === 'filler') return 'diff-line-filler';
    return '';
  }

  /** @param {import('$lib/diff-render.js').MergedSpan} span */
  function spanClass(span) {
    const parts = [];
    if (span.diff === 'added') parts.push('diff-char-added');
    if (span.diff === 'removed') parts.push('diff-char-removed');
    if (span.className) parts.push(span.className);
    return parts.join(' ');
  }

  function handleScroll() {
    if (!scrollEl) return;
    if (gutterEl) gutterEl.scrollTop = scrollEl.scrollTop;
    onscroll(scrollEl.scrollTop, scrollEl.scrollLeft);
  }

  // Compare-before-assign lets the scroll lock terminate on its own: an echoed 'scroll' event
  // from the pane that originated the change finds the value already equal and writes nothing,
  // so no syncing flag or timing dependency is needed to break the feedback loop.
  $effect(() => {
    const top = scrollTop;
    const left = scrollLeft;
    if (scrollEl) {
      if (scrollEl.scrollTop !== top) scrollEl.scrollTop = top;
      if (scrollEl.scrollLeft !== left) scrollEl.scrollLeft = left;
    }
    if (gutterEl && gutterEl.scrollTop !== top) gutterEl.scrollTop = top;
  });
</script>

<div class="flex items-center border-b border-gray-200 px-3 py-2 dark:border-gray-700">
  <span
    title={headerTitle}
    class="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400"
    >{label}</span
  >
</div>
<div class="flex min-h-0 flex-1 overflow-hidden bg-white dark:bg-gray-900" data-pane={label}>
  <!-- gutter: only receives vertical scroll, so line numbers stay pinned during horizontal scroll -->
  <div
    bind:this={gutterEl}
    aria-hidden="true"
    class="shrink-0 overflow-hidden py-0 pr-2 pl-3 font-mono text-sm leading-5 text-gray-400 select-none dark:text-gray-500"
  >
    {#each cells as cell, i (i)}
      <div class="h-5 text-right {cell.type === 'collapsed' ? '' : rowTint(cell)}">
        {cell.lineNumber ?? ''}
      </div>
    {/each}
  </div>
  <!-- content: white-space:pre (never pre-wrap) is what keeps every row exactly one line tall,
       which is the whole alignment guarantee between the two panes -->
  <div
    bind:this={scrollEl}
    onscroll={handleScroll}
    class="min-w-0 flex-1 overflow-auto font-mono text-sm leading-5 [tab-size:4]"
  >
    <div class="min-w-max">
      {#each cells as cell, i (i)}
        {#if cell.type === 'collapsed'}
          <div
            class="flex h-5 items-center justify-center border-y border-dashed border-gray-200 bg-gray-50 text-xs text-gray-400 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-500"
          >
            &hellip; {cell.count} unchanged {cell.count === 1 ? 'line' : 'lines'} &hellip;
          </div>
        {:else}
          <div class="h-5 pr-4 whitespace-pre {rowTint(cell)}">
            {#each cell.spans as span, j (j)}
              <span class={spanClass(span)}
                >{#each toWhitespaceChunks(span.text) as chunk, k (k)}{#if chunk.kind === 'ws'}<span
                      class="diff-ws">{chunk.text}</span
                    >{:else}{chunk.text}{/if}{/each}</span
              >
            {/each}
            {#if cell.hasEol}<span class="diff-ws">&para;</span>{/if}
          </div>
        {/if}
      {/each}
    </div>
  </div>
</div>
