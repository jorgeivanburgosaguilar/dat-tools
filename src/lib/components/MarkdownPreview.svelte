<script>
  import { tick, untrack } from 'svelte';
  import { renderMarkdown } from '$lib/markdown-preview.js';
  import { computePreviewScrollTop, resolveLeadOffsetPx } from '$lib/preview-scroll.js';
  import SplitView from '$lib/components/SplitView.svelte';
  import HtmlTableImportModal from '$lib/components/HtmlTableImportModal.svelte';
  import 'github-markdown-css/github-markdown.css';

  /**
   * @typedef {Object} MarkdownPreviewProps
   * @property {string} [initialContent]
   */

  /** @type {MarkdownPreviewProps} */
  let { initialContent = '' } = $props();

  // untrack prevents Svelte from treating initialContent as a reactive dependency;
  // local state is intentionally initialized once and detached from the prop thereafter.
  let markdown = $state(untrack(() => initialContent));

  let renderedHtml = $derived.by(() => renderMarkdown(markdown));

  let charCount = $derived(markdown.length);
  let wordCount = $derived(markdown.trim() ? markdown.trim().split(/\s+/).length : 0);
  let lineCount = $derived(markdown ? markdown.split('\n').length : 0);

  /** @type {'md' | 'html' | ''} */
  let copied = $state('');

  /** @type {HTMLTextAreaElement | null} */
  let textareaEl = $state(null);
  /** @type {HTMLDivElement | null} */
  let previewScrollEl = $state(null);

  let cursorLine = $state(1);
  // Tracks the caret so "Import HTML Table" can insert at the right spot; defaults to the
  // end of the document so inserting before ever focusing the textarea appends.
  let caret = $state(untrack(() => initialContent).length);

  $effect(() => {
    if (!textareaEl) return;

    function onSelectionChange() {
      if (!textareaEl || document.activeElement !== textareaEl) return;
      caret = textareaEl.selectionStart;
      cursorLine = markdown.slice(0, textareaEl.selectionStart).split('\n').length;
    }

    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  });

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

    const lineHeight = textareaEl ? getComputedStyle(textareaEl).lineHeight : null;
    const leadOffsetPx = resolveLeadOffsetPx(lineHeight);

    const containerRect = previewScrollEl.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    previewScrollEl.scrollTop = computePreviewScrollTop({
      currentScrollTop: previewScrollEl.scrollTop,
      targetTop: targetRect.top,
      containerTop: containerRect.top,
      leadOffsetPx,
      scrollHeight: previewScrollEl.scrollHeight,
      clientHeight: previewScrollEl.clientHeight
    });
  });

  function clear() {
    markdown = '';
  }

  async function copyMarkdown() {
    await navigator.clipboard.writeText(markdown);
    copied = 'md';
    setTimeout(() => (copied = ''), 1500);
  }

  async function copyHtml() {
    await navigator.clipboard.writeText(renderedHtml);
    copied = 'html';
    setTimeout(() => (copied = ''), 1500);
  }

  let showTableImport = $state(false);

  /**
   * Splices `text` into the document at the last known caret position, adding surrounding
   * blank lines only where one isn't already present (a GFM table needs a blank line before
   * it to be recognized), then moves the caret to the end of the inserted block.
   * @param {string} text
   */
  async function insertAtCursor(text) {
    const before = markdown.slice(0, caret);
    const after = markdown.slice(caret);

    const leadingGap =
      before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    const trailingGap =
      after === '' || after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';

    const insertion = leadingGap + text + trailingGap;
    const insertEnd = before.length + insertion.length;

    markdown = before + insertion + after;
    showTableImport = false;

    await tick();
    textareaEl?.focus();
    textareaEl?.setSelectionRange(insertEnd, insertEnd);
    caret = insertEnd;
  }
</script>

<SplitView>
  {#snippet first()}
    <div class="border-b border-gray-200 px-3 py-2 dark:border-gray-700">
      <span class="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400"
        >Markdown</span
      >
    </div>
    <textarea
      bind:this={textareaEl}
      bind:value={markdown}
      class="flex-1 resize-none bg-white p-4 font-mono text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
      placeholder="Type your markdown here..."></textarea>
  {/snippet}

  {#snippet second()}
    <div class="border-b border-gray-200 px-3 py-2 dark:border-gray-700">
      <span class="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400"
        >Preview</span
      >
    </div>
    <div bind:this={previewScrollEl} class="flex-1 overflow-y-auto">
      <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized by DOMPurify in renderMarkdown -->
      <div class="markdown-body p-4">{@html renderedHtml}</div>
    </div>
  {/snippet}

  {#snippet actions()}
    <button
      onclick={() => (showTableImport = true)}
      class="rounded px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
    >
      Import HTML Table
    </button>
    <button
      onclick={clear}
      class="rounded px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
    >
      Clear
    </button>
    <button
      onclick={copyMarkdown}
      class="rounded px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
    >
      {copied === 'md' ? '✓ Copied' : 'Copy MD'}
    </button>
    <button
      onclick={copyHtml}
      class="rounded px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
    >
      {copied === 'html' ? '✓ Copied' : 'Copy HTML'}
    </button>
  {/snippet}

  {#snippet status()}
    {wordCount} words · {lineCount} lines · {charCount} characters
  {/snippet}
</SplitView>

<HtmlTableImportModal
  open={showTableImport}
  oninsert={insertAtCursor}
  onclose={() => (showTableImport = false)}
/>
