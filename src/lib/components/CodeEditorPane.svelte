<script>
  import { onMount } from 'svelte';
  import { toRowSpans } from '$lib/line-gutter.js';

  /**
   * @typedef {Object} CodeEditorPaneProps
   * @property {string} label - Pane header label (e.g. "Original", "Changed").
   * @property {string} [value] - Two-way bound editor content.
   * @property {string} [placeholder]
   * @property {boolean} [wrap] - Two-way bound "wrap long lines" toggle.
   * @property {import('svelte').Snippet} [headerExtra] - Rendered after the Ln/Col readout, e.g. a validity badge.
   */

  /** @type {CodeEditorPaneProps} */
  let {
    label,
    value = $bindable(''),
    placeholder = 'Paste text here...',
    wrap = $bindable(true),
    headerExtra
  } = $props();

  /** @type {HTMLTextAreaElement | null} */
  let textareaEl = $state(null);
  /** @type {HTMLDivElement | null} */
  let gutterEl = $state(null);
  /** @type {HTMLDivElement | null} */
  let mirrorEl = $state(null);

  let focused = $state(false);
  let cursorLine = $state(1);
  let cursorCol = $state(1);

  let lines = $derived(value === '' ? [''] : value.split('\n'));
  let lineCount = $derived(lines.length);
  let lineNumbers = $derived(Array.from({ length: lineCount }, (_, i) => i + 1));

  /** Row span per logical line (>= 1) - how many visual rows it wraps onto. Only used when `wrap`. */
  let rowSpans = $state(/** @type {number[]} */ ([]));
  let lineHeightPx = $state(20);

  /** @type {number | null} */
  let measureHandle = null;

  /** Coalesces re-measurement onto a single animation frame per burst of changes. */
  function scheduleMeasure() {
    if (!wrap) return;
    if (measureHandle !== null) cancelAnimationFrame(measureHandle);
    measureHandle = requestAnimationFrame(measure);
  }

  /**
   * Sizes the hidden mirror to the textarea's current content width (which already excludes its
   * scrollbar, if one is showing) and reads back each line's wrapped height, so the gutter can
   * reserve the same number of visual rows without reimplementing the browser's line-wrapping.
   */
  function measure() {
    measureHandle = null;
    if (!wrap || !mirrorEl || !textareaEl) return;
    mirrorEl.style.width = `${textareaEl.clientWidth}px`;
    lineHeightPx = parseFloat(getComputedStyle(textareaEl).lineHeight) || lineHeightPx;
    const heights = Array.from(mirrorEl.children, (el) => el.getBoundingClientRect().height);
    rowSpans = toRowSpans(heights, lineHeightPx);
  }

  $effect(() => {
    // Re-measure whenever the visible lines or the wrap mode change.
    void lines;
    void wrap;
    scheduleMeasure();
  });

  onMount(() => {
    if (!textareaEl) return;
    // Pane widths can change from a window resize or a dragged split-view divider - either
    // reflows the textarea's wrapping without firing any Svelte reactivity on its own.
    const observer = new ResizeObserver(() => scheduleMeasure());
    observer.observe(textareaEl);
    return () => {
      observer.disconnect();
      if (measureHandle !== null) cancelAnimationFrame(measureHandle);
    };
  });

  function syncGutter() {
    if (gutterEl && textareaEl) gutterEl.scrollTop = textareaEl.scrollTop;
  }

  function updateCursor() {
    if (!textareaEl) return;
    const pos = textareaEl.selectionStart;
    const before = value.slice(0, pos);
    cursorLine = (before.match(/\n/g) ?? []).length + 1;
    cursorCol = pos - before.lastIndexOf('\n');
  }
</script>

<div
  class="flex items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-gray-700"
>
  <span class="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400"
    >{label}</span
  >
  <div class="flex items-center gap-3">
    {#if focused}
      <span class="inline-flex items-center text-xs text-gray-400 dark:text-gray-500"
        >Ln {cursorLine}, Col {cursorCol}</span
      >
    {/if}
    <button
      type="button"
      onclick={() => (wrap = !wrap)}
      aria-pressed={wrap}
      title="Wrap long lines"
      class="rounded px-2 py-0.5 text-xs font-medium transition-colors {wrap
        ? 'bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-100'
        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100'}"
    >
      Wrap
    </button>
    {@render headerExtra?.()}
  </div>
</div>
<div class="flex min-h-0 flex-1 overflow-hidden bg-white dark:bg-gray-900">
  <!-- gutter -->
  <div
    bind:this={gutterEl}
    aria-hidden="true"
    class="overflow-hidden py-4 pr-2 pl-3 font-mono text-sm leading-5 text-gray-400 select-none dark:text-gray-500"
  >
    {#each lineNumbers as lineNum, i (lineNum)}
      <div
        data-gutter-row
        class="text-right"
        style={wrap ? `height: ${(rowSpans[i] ?? 1) * lineHeightPx}px` : ''}
      >
        {lineNum}
      </div>
    {/each}
  </div>
  <!-- editor -->
  <div class="relative min-w-0 flex-1">
    {#if wrap}
      <!-- hidden mirror: an invisible copy of the textarea's text, laid out with the same box and
           typography, used only to measure how many visual rows each logical line wraps onto so
           the gutter row heights above can match. Kept out of the accessibility tree, pointer
           events, and selection, and positioned so it never affects the flex layout around it. -->
      <div
        bind:this={mirrorEl}
        aria-hidden="true"
        class="invisible absolute top-0 left-0 border-0 py-4 pr-4 pl-3 font-mono text-sm leading-5 break-words whitespace-pre-wrap [tab-size:4]"
      >
        {#each lines as line, i (i)}
          <div>{line || '​'}</div>
        {/each}
      </div>
    {/if}
    <textarea
      bind:this={textareaEl}
      bind:value
      onscroll={syncGutter}
      onfocus={() => {
        focused = true;
        updateCursor();
      }}
      onblur={() => {
        focused = false;
      }}
      onkeyup={updateCursor}
      onclick={updateCursor}
      spellcheck="false"
      wrap={wrap ? 'soft' : 'off'}
      class="h-full w-full resize-none border-0 bg-transparent py-4 pr-4 pl-3 font-mono text-sm leading-5 [tab-size:4] text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-gray-500 {wrap
        ? ''
        : 'whitespace-pre'}"
      {placeholder}></textarea>
  </div>
</div>
