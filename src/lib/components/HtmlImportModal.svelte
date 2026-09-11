<script>
  import { htmlToMarkdown } from '$lib/html-to-markdown.js';

  /**
   * @typedef {Object} HtmlImportModalProps
   * @property {boolean} [open]
   * @property {(markdown: string) => void} [oninsert]
   * @property {() => void} [onclose]
   */

  /** @type {HtmlImportModalProps} */
  let { open = false, oninsert = () => {}, onclose = () => {} } = $props();

  let html = $state('');
  /** @type {HTMLDialogElement | null} */
  let dialogEl = $state(null);

  let result = $derived.by(() => {
    if (!html.trim()) return { markdown: '', error: '' };
    try {
      return { markdown: htmlToMarkdown(html), error: '' };
    } catch (err) {
      return { markdown: '', error: /** @type {Error} */ (err).message };
    }
  });

  $effect(() => {
    if (!dialogEl) return;
    if (open && !dialogEl.open) {
      dialogEl.showModal();
    } else if (!open && dialogEl.open) {
      dialogEl.close();
    }
  });

  function handleClose() {
    html = '';
    onclose();
  }

  function handleCancel() {
    dialogEl?.close();
  }

  function handleInsert() {
    if (result.error || !result.markdown) return;
    oninsert(result.markdown);
    dialogEl?.close();
  }
</script>

<dialog
  bind:this={dialogEl}
  onclose={handleClose}
  class="fixed inset-0 m-auto h-fit w-full max-w-2xl rounded-lg bg-white p-0 shadow-xl backdrop:bg-black/50 dark:bg-gray-800"
>
  <div class="flex flex-col p-6">
    <h3 class="mb-1 text-xl font-bold text-gray-900 dark:text-gray-100">Import HTML</h3>
    <p class="mb-4 text-sm text-gray-600 dark:text-gray-300">
      Paste a full HTML fragment. Its headings, text, links, lists, code, images, and tables are
      converted to Markdown and inserted at your cursor.
    </p>

    <span
      class="mb-1 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400"
    >
      HTML
    </span>
    <textarea
      bind:value={html}
      class="h-64 resize-none rounded border border-gray-200 bg-white p-3 font-mono text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
      placeholder="<h1>Title</h1>
<p>Paste any HTML here…</p>"></textarea>

    {#if result.error}
      <p class="mt-2 text-sm text-red-600 dark:text-red-400">{result.error}</p>
    {/if}

    <div class="mt-4 flex justify-end">
      <div class="flex gap-3">
        <button
          onclick={handleCancel}
          class="rounded-lg bg-gray-200 px-4 py-2 font-semibold text-gray-700 transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
        >
          Cancel
        </button>
        <button
          onclick={handleInsert}
          disabled={!!result.error || !result.markdown}
          class="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 dark:disabled:bg-gray-600 dark:disabled:text-gray-400"
        >
          Insert
        </button>
      </div>
    </div>
  </div>
</dialog>
