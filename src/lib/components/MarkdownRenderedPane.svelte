<script>
  /**
   * The rendered Markdown preview pane, extracted out of `MarkdownPreview.svelte` for the same
   * reason as `MarkdownEditorPane.svelte`: a snippet can't cross a document boundary, a component
   * can. This pane is always display-only for `markdown`/`cursorLine`/`lineHeightPx` - it never
   * calls `sync.send(...)` itself; whichever window hosts `MarkdownEditorPane` is the writer.
   *
   * `renderMarkdown` is pure, so this pane renders its own HTML locally from the raw markdown
   * rather than receiving pre-rendered HTML over the sync channel - HTML would be 5-10x larger to
   * ship, and would move the DOMPurify sanitization boundary across a message channel for no
   * benefit.
   *
   * The cursor-follow scroll effect lives here (rather than in the parent, as it originally did)
   * because it's fundamentally this pane's own concern: it only needs `cursorLine` and
   * `lineHeightPx` as plain numbers - both cross a window boundary fine - never direct DOM access
   * to the editor's textarea.
   */

  import { renderMarkdown } from '$lib/markdown-preview.js';
  import { computePreviewScrollTop, resolveLeadOffsetPx } from '$lib/preview-scroll.js';
  import PopoutButton from './PopoutButton.svelte';

  /**
   * @typedef {Object} MarkdownRenderedPaneProps
   * @property {string} markdown
   * @property {number} cursorLine
   * @property {number} lineHeightPx - 0 when not yet measured; `resolveLeadOffsetPx` falls back to
   *   a fixed lead offset for any non-positive value, which covers both "not yet measured" and "no
   *   local textarea to measure at all" (this pane popped out on its own).
   * @property {() => void} [onpopout] - Omit to hide the pop-out button.
   */

  /** @type {MarkdownRenderedPaneProps} */
  let { markdown, cursorLine, lineHeightPx, onpopout } = $props();

  let renderedHtml = $derived.by(() => renderMarkdown(markdown));

  /** @type {HTMLDivElement | null} */
  let previewScrollEl = $state(null);

  $effect(() => {
    if (!previewScrollEl) return;
    renderedHtml;
    const line = cursorLine;

    const anchors = /** @type {NodeListOf<HTMLElement>} */ (
      previewScrollEl.querySelectorAll('.markdown-body [data-line]')
    );
    if (!anchors.length) return;

    let target = anchors[0];
    for (const el of anchors) {
      const elLine = parseInt(el.getAttribute('data-line') || '0', 10);
      if (elLine <= line) target = el;
      else break;
    }

    const containerRect = previewScrollEl.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    previewScrollEl.scrollTop = computePreviewScrollTop({
      currentScrollTop: previewScrollEl.scrollTop,
      targetTop: targetRect.top,
      containerTop: containerRect.top,
      leadOffsetPx: resolveLeadOffsetPx(lineHeightPx),
      scrollHeight: previewScrollEl.scrollHeight,
      clientHeight: previewScrollEl.clientHeight
    });
  });
</script>

<div
  class="flex items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-gray-700"
>
  <span class="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
    Preview
  </span>
  {#if onpopout}
    <PopoutButton label="Preview" onclick={onpopout} />
  {/if}
</div>
<div bind:this={previewScrollEl} class="flex-1 overflow-y-auto">
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized by DOMPurify in renderMarkdown -->
  <div class="markdown-body p-4">{@html renderedHtml}</div>
</div>
