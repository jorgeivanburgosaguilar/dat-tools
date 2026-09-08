<script>
  import { onMount } from 'svelte';
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
   * @property {boolean} [wrap] - Wrap long lines instead of scrolling horizontally.
   * @property {number[]} [rowHeights] - Row height (px) to apply per cell, already maxed across
   *   every pane sharing this diff so a row pair stays level; supplied by the parent, which
   *   collects each pane's own natural heights via `onmeasure` first. Ignored when `!wrap`.
   * @property {(heights: number[]) => void} [onmeasure] - Reports this pane's own natural
   *   (unclamped) row heights, recomputed whenever `cells`/`wrap` change or the pane is resized.
   * @property {number} [scrollFractionY] - Cross-window scroll sync (see DiffChecker.svelte):
   *   `scrollTop / (scrollHeight - clientHeight)` from whichever window's pane last scrolled.
   *   Omit entirely (rather than passing 0) when no other window needs to follow this pane's
   *   scroll - passing a real value fights the pixel-based `scrollTop`/`scrollLeft` intra-window
   *   lock above, which two windows can never agree on since each has its own pane width/wrapping.
   * @property {number} [scrollFractionX] - Same idea, horizontal.
   * @property {(y: number, x: number) => void} [onscrollfraction] - Reports this pane's own
   *   scroll position as a fraction, independent of `onscroll`'s pixel report.
   */

  /** @type {DiffPaneProps} */
  let {
    label,
    cells,
    headerTitle = undefined,
    scrollTop = 0,
    scrollLeft = 0,
    onscroll = () => {},
    wrap = false,
    rowHeights = [],
    onmeasure = () => {},
    scrollFractionY = undefined,
    scrollFractionX = undefined,
    onscrollfraction = () => {}
  } = $props();

  /** @type {HTMLDivElement | null} */
  let scrollEl = $state(null);
  /** @type {HTMLDivElement | null} */
  let gutterEl = $state(null);

  let lineHeightPx = $state(20);

  /** @type {number | null} */
  let measureHandle = null;

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

    const maxY = scrollEl.scrollHeight - scrollEl.clientHeight;
    const maxX = scrollEl.scrollWidth - scrollEl.clientWidth;
    const fracY = maxY > 0 ? scrollEl.scrollTop / maxY : 0;
    const fracX = maxX > 0 ? scrollEl.scrollLeft / maxX : 0;
    // Rounded so a value that round-trips through another window's `applyPatch` lands on the same
    // float bit-for-bit, letting its `===` skip (and DiffChecker's own tolerance check) terminate
    // the echo instead of bouncing forever.
    onscrollfraction(Math.round(fracY * 1e5) / 1e5, Math.round(fracX * 1e5) / 1e5);
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

  /**
   * Converts an incoming scroll *fraction* (from another window - see DiffChecker.svelte) into a
   * pixel position using this pane's own scroll extents, which another window can never share
   * (different pane width/wrapping). A 1px tolerance avoids re-triggering `handleScroll` for a
   * rounding difference that would otherwise re-report a fraction 1px off forever.
   */
  function applyScrollFraction() {
    if (!scrollEl) return;
    const maxY = scrollEl.scrollHeight - scrollEl.clientHeight;
    const maxX = scrollEl.scrollWidth - scrollEl.clientWidth;
    if (scrollFractionY !== undefined && maxY > 0) {
      const target = Math.round(scrollFractionY * maxY);
      if (Math.abs(scrollEl.scrollTop - target) > 1) scrollEl.scrollTop = target;
    }
    if (scrollFractionX !== undefined && maxX > 0) {
      const target = Math.round(scrollFractionX * maxX);
      if (Math.abs(scrollEl.scrollLeft - target) > 1) scrollEl.scrollLeft = target;
    }
  }

  $effect(() => {
    // Re-applied whenever a new fraction arrives, not just once - see `measure()` below for the
    // other case (layout settling after this effect already ran once at maxScroll === 0).
    void scrollFractionY;
    void scrollFractionX;
    applyScrollFraction();
  });

  function scheduleMeasure() {
    if (!wrap) return;
    if (measureHandle !== null) cancelAnimationFrame(measureHandle);
    measureHandle = requestAnimationFrame(measure);
  }

  /**
   * Reads back each row's natural (unwrapped-by-min-height) content height. `min-height` on a
   * row's outer wrapper never affects its inner content element's own height - the inner element
   * is a plain block sized by its content, not stretched to fill the wrapper - so this measures
   * true wrapped height in one pass even while a previous (possibly taller) `rowHeights` value is
   * still applied to the wrapper.
   */
  function measure() {
    measureHandle = null;
    if (!wrap || !scrollEl) return;
    lineHeightPx = parseFloat(getComputedStyle(scrollEl).lineHeight) || lineHeightPx;
    const heights = Array.from(
      scrollEl.querySelectorAll('[data-row-inner]'),
      (el) => el.getBoundingClientRect().height
    );
    onmeasure(heights);
    // A fraction that arrived while this pane's content was still short (maxScroll === 0, so
    // applyScrollFraction() above was a no-op) is retried here once real layout has settled.
    applyScrollFraction();
  }

  $effect(() => {
    // Re-measure whenever the visible rows or the wrap mode change.
    void cells;
    void wrap;
    scheduleMeasure();
  });

  onMount(() => {
    if (!scrollEl) return;
    // Pane widths can change from a window resize or a dragged split-view divider - either
    // reflows every row's wrapping without firing any Svelte reactivity on its own.
    const observer = new ResizeObserver(() => scheduleMeasure());
    observer.observe(scrollEl);
    return () => {
      observer.disconnect();
      if (measureHandle !== null) cancelAnimationFrame(measureHandle);
    };
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
      {@const fixedHeight = !wrap || cell.type === 'collapsed'}
      <div
        data-diff-row
        class="text-right {fixedHeight ? 'h-5' : ''} {cell.type === 'collapsed'
          ? ''
          : rowTint(cell)}"
        style={fixedHeight ? '' : `min-height: ${rowHeights[i] ?? lineHeightPx}px`}
      >
        {cell.lineNumber ?? ''}
      </div>
    {/each}
  </div>
  <!-- content: unwrapped, white-space:pre (never pre-wrap) keeps every row exactly one line tall,
       which is the alignment guarantee between the two panes. Wrapped, row heights are measured
       (see `measure()` above) and matched across panes instead. -->
  <div
    bind:this={scrollEl}
    onscroll={handleScroll}
    class="min-w-0 flex-1 overflow-auto font-mono text-sm leading-5 [tab-size:4]"
  >
    <div class={wrap ? '' : 'min-w-max'}>
      {#each cells as cell, i (i)}
        {#if cell.type === 'collapsed'}
          <div
            data-diff-row
            class="flex h-5 items-center justify-center border-y border-dashed border-gray-200 bg-gray-50 text-xs text-gray-400 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-500"
          >
            <div data-row-inner>
              &hellip; {cell.count} unchanged {cell.count === 1 ? 'line' : 'lines'} &hellip;
            </div>
          </div>
        {:else}
          <div
            data-diff-row
            class="pr-4 {wrap ? '' : 'h-5'} {rowTint(cell)}"
            style={wrap ? `min-height: ${rowHeights[i] ?? lineHeightPx}px` : ''}
          >
            <div data-row-inner class={wrap ? 'break-words whitespace-pre-wrap' : 'whitespace-pre'}>
              {#each cell.spans as span, j (j)}
                <span class={spanClass(span)}
                  >{#each toWhitespaceChunks(span.text) as chunk, k (k)}{#if chunk.kind === 'ws'}<span
                        class="diff-ws">{chunk.text}</span
                      >{:else}{chunk.text}{/if}{/each}</span
                >
              {/each}
              {#if cell.hasEol}<span class="diff-ws">&para;</span>{/if}
              {#if cell.spans.length === 0 && !cell.hasEol && cell.type !== 'filler'}&nbsp;{/if}
            </div>
          </div>
        {/if}
      {/each}
    </div>
  </div>
</div>
