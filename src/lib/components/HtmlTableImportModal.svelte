<script>
  import { htmlTableToMarkdown } from '$lib/html-table-to-markdown.js';

  /**
   * @typedef {Object} HtmlTableImportModalProps
   * @property {boolean} [open]
   * @property {(markdown: string) => void} [oninsert]
   * @property {() => void} [onclose]
   */

  /** @type {HtmlTableImportModalProps} */
  let { open = false, oninsert = () => {}, onclose = () => {} } = $props();

  let html = $state('');
  /** @type {HTMLDialogElement | null} */
  let dialogEl = $state(null);

  let result = $derived.by(() => {
    if (!html.trim()) return { markdown: '', tableCount: 0, error: '' };
    try {
      const { markdown, tableCount } = htmlTableToMarkdown(html);
      return { markdown, tableCount, error: '' };
    } catch (err) {
      return { markdown: '', tableCount: 0, error: /** @type {Error} */ (err).message };
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
    <h3 class="mb-1 text-xl font-bold text-gray-900 dark:text-gray-100">Import HTML Table</h3>
    <p class="mb-4 text-sm text-gray-600 dark:text-gray-300">
      Paste HTML containing one or more &lt;table&gt; elements. It's converted to a markdown table
      and inserted at your cursor.
    </p>

    <span
      class="mb-1 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400"
    >
      HTML
    </span>
    <textarea
      bind:value={html}
      class="h-64 resize-none rounded border border-gray-200 bg-white p-3 font-mono text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
      placeholder="<table>...</table>"></textarea>

    {#if result.error}
      <p class="mt-2 text-sm text-red-600 dark:text-red-400">{result.error}</p>
    {/if}

    <div class="mt-4 flex items-center justify-between">
      <span class="text-xs text-gray-500 dark:text-gray-400">
        {result.tableCount} table{result.tableCount === 1 ? '' : 's'} converted
      </span>
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
