<script>
  import { untrack } from 'svelte';
  import { browser } from '$app/environment';
  import { renderMarkdown } from '$lib/markdown-preview.js';
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

  /** @type {any} */
  let purify = $state(null);

  if (browser) {
    import('dompurify').then((mod) => {
      purify = mod.default;
    });
  }

  let renderedHtml = $derived.by(() => renderMarkdown(markdown, purify));

  let charCount = $derived(markdown.length);
  let wordCount = $derived(markdown.trim() ? markdown.trim().split(/\s+/).length : 0);
  let lineCount = $derived(markdown ? markdown.split('\n').length : 0);

  /** @type {'editor' | 'split' | 'preview'} */
  let viewMode = $state('split');

  /** @type {'horizontal' | 'vertical'} */
  let layout = $state('horizontal');

  /** @type {'' | 'md' | 'html'} */
  let copied = $state('');

  // Scroll sync — cursor-based
  /** @type {HTMLTextAreaElement | null} */
  let textareaEl = $state(null);
  /** @type {HTMLDivElement | null} */
  let previewScrollEl = $state(null);

  let cursorLine = $state(1);

  // selectionchange covers typing, arrow keys, and mouse clicks in one event.
  // We listen on document but filter to only act when the textarea is focused.
  $effect(() => {
    if (!textareaEl) return;

    function onSelectionChange() {
      if (!textareaEl || document.activeElement !== textareaEl) return;
      cursorLine = markdown.slice(0, textareaEl.selectionStart).split('\n').length;
    }

    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  });

  // Sync preview scroll after every re-render (renderedHtml) or cursor move (cursorLine).
  $effect(() => {
    if (!previewScrollEl) return;
    renderedHtml; // re-run after preview re-renders
    const line = cursorLine; // re-run when cursor moves

    // Find the last block element whose data-line value is <= current cursor line.
    // The renderer embeds data-line on every block element via renderMarkdown().
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

    // Compute the element's absolute offset within the scroll container and
    // assign it directly (not +=) so the result is idempotent.
    const containerRect = previewScrollEl.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    previewScrollEl.scrollTop = previewScrollEl.scrollTop + targetRect.top - containerRect.top;
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
</script>

<div class="flex h-full flex-col">
  <!-- Toolbar -->
  <div
    class="flex shrink-0 items-center gap-3 border-b border-gray-200 px-3 py-2 dark:border-gray-700"
  >
    <!-- View mode toggle -->
    <div class="flex overflow-hidden rounded border border-gray-200 text-xs dark:border-gray-700">
      <button
        onclick={() => (viewMode = 'editor')}
        class="px-2.5 py-1 font-medium transition-colors {viewMode === 'editor'
          ? 'bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-100'
          : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'}"
      >
        Editor
      </button>
      <button
        onclick={() => (viewMode = 'split')}
        class="border-x border-gray-200 px-2.5 py-1 font-medium transition-colors dark:border-gray-700 {viewMode ===
        'split'
          ? 'bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-100'
          : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'}"
      >
        Split
      </button>
      <button
        onclick={() => (viewMode = 'preview')}
        class="px-2.5 py-1 font-medium transition-colors {viewMode === 'preview'
          ? 'bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-100'
          : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'}"
      >
        Preview
      </button>
    </div>

    <!-- Layout direction toggle (split mode only) -->
    {#if viewMode === 'split'}
      <button
        onclick={() => (layout = layout === 'horizontal' ? 'vertical' : 'horizontal')}
        title={layout === 'horizontal'
          ? 'Switch to stacked layout'
          : 'Switch to side-by-side layout'}
        class="rounded border border-gray-200 px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
      >
        {layout === 'horizontal' ? '↕ Stack' : '↔ Side by side'}
      </button>
    {/if}

    <!-- Actions -->
    <div class="ml-auto flex items-center gap-1">
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
    </div>
  </div>

  <!-- Panes -->
  <div
    class="flex min-h-0 flex-1 {viewMode === 'split' && layout === 'vertical' ? 'flex-col' : ''}"
  >
    {#if viewMode !== 'preview'}
      <div
        class="flex flex-col {viewMode === 'split'
          ? layout === 'vertical'
            ? 'h-1/2 border-b border-gray-200 dark:border-gray-700'
            : 'w-1/2 border-r border-gray-200 dark:border-gray-700'
          : 'w-full'}"
      >
        <div class="border-b border-gray-200 px-3 py-2 dark:border-gray-700">
          <span
            class="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400"
            >Markdown</span
          >
        </div>
        <textarea
          bind:this={textareaEl}
          bind:value={markdown}
          class="flex-1 resize-none bg-white p-4 font-mono text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
          placeholder="Type your markdown here..."
        ></textarea>
      </div>
    {/if}

    {#if viewMode !== 'editor'}
      <div
        class="flex flex-col {viewMode === 'split'
          ? layout === 'vertical'
            ? 'h-1/2'
            : 'w-1/2'
          : 'w-full'}"
      >
        <div class="border-b border-gray-200 px-3 py-2 dark:border-gray-700">
          <span
            class="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400"
            >Preview</span
          >
        </div>
        <div bind:this={previewScrollEl} class="flex-1 overflow-y-auto">
          <!-- renderedHtml is sanitized by DOMPurify inside renderMarkdown before being passed here -->
          <div class="markdown-body p-4">{@html renderedHtml}</div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Status bar -->
  <div
    class="border-t border-gray-200 px-4 py-1.5 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400"
  >
    {wordCount} words · {lineCount} lines · {charCount} characters
  </div>
</div>
