<script>
  import { untrack } from 'svelte'
  import { browser } from '$app/environment'
  import { renderMarkdown } from '$lib/markdown-preview.js'
  import 'github-markdown-css/github-markdown.css'

  /**
   * @typedef {Object} MarkdownPreviewProps
   * @property {string} [initialContent]
   */

  /** @type {MarkdownPreviewProps} */
  let { initialContent = '' } = $props()

  // untrack prevents Svelte from treating initialContent as a reactive dependency;
  // local state is intentionally initialized once and detached from the prop thereafter.
  let markdown = $state(untrack(() => initialContent))

  /** @type {any} */
  let purify = $state(null)

  if (browser) {
    import('dompurify').then((mod) => {
      purify = mod.default
    })
  }

  let renderedHtml = $derived.by(() => renderMarkdown(markdown, purify))

  let charCount = $derived(markdown.length)

  function clear() {
    markdown = ''
  }

  async function copyToClipboard() {
    await navigator.clipboard.writeText(markdown)
  }
</script>

<div class="flex h-full flex-col">
  <!-- Split area -->
  <div class="flex min-h-0 flex-1 divide-x divide-gray-200 dark:divide-gray-700">
    <!-- Editor pane -->
    <div class="flex w-1/2 flex-col">
      <div
        class="flex items-center gap-2 border-b border-gray-200 px-3 py-2 dark:border-gray-700"
      >
        <span class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
          >Markdown</span
        >
        <button
          onclick={clear}
          class="rounded px-2 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
        >
          Clear
        </button>
        <button
          onclick={copyToClipboard}
          class="rounded px-2 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
        >
          Copy
        </button>
      </div>
      <textarea
        bind:value={markdown}
        class="flex-1 resize-none bg-gray-900 p-4 font-mono text-sm text-gray-100 outline-none placeholder:text-gray-500"
        placeholder="Type your markdown here..."
      ></textarea>
    </div>

    <!-- Preview pane -->
    <div class="flex w-1/2 flex-col">
      <div class="border-b border-gray-200 px-3 py-2 dark:border-gray-700">
        <span
          class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
          >Preview</span
        >
      </div>
      <div class="flex-1 overflow-y-auto px-8 py-6">
        <!-- renderedHtml is sanitized by DOMPurify inside renderMarkdown before being passed here -->
        <div class="markdown-body">{@html renderedHtml}</div>
      </div>
    </div>
  </div>

  <!-- Status bar -->
  <div
    class="border-t border-gray-200 px-4 py-1.5 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400"
  >
    {charCount} characters
  </div>
</div>
