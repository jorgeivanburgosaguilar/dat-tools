<script>
  /**
   * The Markdown source editor pane, extracted out of `MarkdownPreview.svelte` so it can be
   * rendered on its own inside a satellite (popped-out) window as well as inline in the main split
   * view - a Svelte snippet (what this used to be) can't cross a document boundary, but a component
   * can be mounted in either window.
   *
   * This pane is always the write-authoritative side for `value`/cursor/line-height: whichever
   * window currently hosts this component is the one sending patches (see MarkdownPreview.svelte's
   * `$effect` that calls `sync.send(...)` only while this pane isn't popped away).
   */

  import { onMount } from 'svelte';
  import PopoutButton from './PopoutButton.svelte';

  /**
   * @typedef {Object} MarkdownEditorPaneProps
   * @property {string} value - Two-way bound markdown source.
   * @property {string} [placeholder]
   * @property {(payload: { cursorLine: number, caret: number }) => void} [oncursor] - Fired on
   *   caret movement; `caret` is intentionally local-only (see MarkdownPreview.svelte) and not part
   *   of the synced state.
   * @property {(lineHeightPx: number) => void} [onlineheight] - Fired on mount and on resize with
   *   this textarea's computed line-height, so the preview pane (which may be in another window and
   *   have no textarea of its own to measure) can align its cursor-follow scroll.
   * @property {() => void} [onpopout] - Omit to hide the pop-out button.
   */

  /** @type {MarkdownEditorPaneProps} */
  let {
    value = $bindable(''),
    placeholder = 'Type your markdown here...',
    oncursor = () => {},
    onlineheight = () => {},
    onpopout
  } = $props();

  /** @type {HTMLTextAreaElement | null} */
  let textareaEl = $state(null);

  $effect(() => {
    if (!textareaEl) return;
    const doc = textareaEl.ownerDocument;

    function onSelectionChange() {
      if (!textareaEl || doc.activeElement !== textareaEl) return;
      const caret = textareaEl.selectionStart;
      oncursor({ cursorLine: value.slice(0, caret).split('\n').length, caret });
    }

    doc.addEventListener('selectionchange', onSelectionChange);
    return () => doc.removeEventListener('selectionchange', onSelectionChange);
  });

  onMount(() => {
    if (!textareaEl) return;

    function reportLineHeight() {
      if (!textareaEl) return;
      const lineHeight = parseFloat(getComputedStyle(textareaEl).lineHeight);
      if (Number.isFinite(lineHeight)) onlineheight(lineHeight);
    }

    reportLineHeight();
    const observer = new ResizeObserver(reportLineHeight);
    observer.observe(textareaEl);
    return () => observer.disconnect();
  });

  /**
   * Focuses the textarea and moves the caret to `position`. Exposed for
   * `MarkdownPreview.svelte`'s "Import HTML" flow, the one place outside this pane that
   * legitimately needs to drive its focus/selection after inserting text.
   * @param {number} position
   */
  export function focusAt(position) {
    textareaEl?.focus();
    textareaEl?.setSelectionRange(position, position);
  }
</script>

<div
  class="flex items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-gray-700"
>
  <span class="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
    Markdown
  </span>
  {#if onpopout}
    <PopoutButton label="Markdown" onclick={onpopout} />
  {/if}
</div>
<textarea
  bind:this={textareaEl}
  bind:value
  {placeholder}
  class="flex-1 resize-none bg-white p-4 font-mono text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
></textarea>
