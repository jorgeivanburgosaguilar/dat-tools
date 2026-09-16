<script>
  import { htmlToTrajectory, EXAMPLE_TOOL_CALLS_HTML } from '$lib/html-tool-calls.js';

  /**
   * @typedef {Object} HtmlToolCallsImportModalProps
   * @property {boolean} [open]
   * @property {(json: string) => void} [onimport]
   * @property {() => void} [onclose]
   */

  /** @type {HtmlToolCallsImportModalProps} */
  let { open = false, onimport = () => {}, onclose = () => {} } = $props();

  let html = $state('');
  let dragActive = $state(false);
  /** @type {HTMLDialogElement | null} */
  let dialogEl = $state(null);
  /** @type {HTMLInputElement | null} */
  let fileInputEl = $state(null);

  let result = $derived.by(() => {
    if (!html.trim())
      return {
        trajectory: /** @type {ReturnType<typeof htmlToTrajectory> | null} */ (null),
        error: ''
      };
    try {
      return { trajectory: htmlToTrajectory(html), error: '' };
    } catch (err) {
      return { trajectory: null, error: /** @type {Error} */ (err).message };
    }
  });

  let summary = $derived.by(() => {
    const trajectory = result.trajectory;
    if (!trajectory) return '';
    const steps = trajectory.steps;
    const toolCalls = steps.reduce(
      (n, step) => n + (Array.isArray(step.tool_calls) ? step.tool_calls.length : 0),
      0
    );
    const results = steps.reduce((n, step) => {
      const observation = /** @type {{ results?: unknown[] } | undefined} */ (step.observation);
      return n + (Array.isArray(observation?.results) ? observation.results.length : 0);
    }, 0);
    return `${steps.length} steps · ${toolCalls} tool calls · ${results} results`;
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

  function handleLoadExample() {
    html = EXAMPLE_TOOL_CALLS_HTML;
  }

  /** @param {File} file */
  async function loadFile(file) {
    html = await file.text();
  }

  /** @param {DragEvent} e */
  function onDrop(e) {
    e.preventDefault();
    dragActive = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) loadFile(file);
  }

  /** @param {Event} e */
  function onFileChange(e) {
    const file = /** @type {HTMLInputElement} */ (e.currentTarget).files?.[0];
    if (file) loadFile(file);
  }

  /** @param {KeyboardEvent} e */
  function onDropzoneKeydown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInputEl?.click();
    }
  }

  function handleImport() {
    if (result.error || !result.trajectory) return;
    onimport(JSON.stringify(result.trajectory, null, 2));
    dialogEl?.close();
  }
</script>

<dialog
  bind:this={dialogEl}
  onclose={handleClose}
  class="fixed inset-0 m-auto h-fit w-full max-w-2xl rounded-lg bg-white p-0 shadow-xl backdrop:bg-black/50 dark:bg-gray-800"
>
  <div class="flex flex-col p-6">
    <h3 class="mb-1 text-xl font-bold text-gray-900 dark:text-gray-100">Import HTML Tool Calls</h3>
    <p class="mb-4 text-sm text-gray-600 dark:text-gray-300">
      Drop an exported HTML tool-call transcript, paste it below, or try the bundled example. It's
      converted into trajectory JSON and loaded into the viewer.
    </p>

    <div
      role="button"
      tabindex="0"
      ondragover={(e) => {
        e.preventDefault();
        dragActive = true;
      }}
      ondragleave={() => (dragActive = false)}
      ondrop={onDrop}
      onclick={() => fileInputEl?.click()}
      onkeydown={onDropzoneKeydown}
      class="mb-3 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-4 text-sm transition-colors {dragActive
        ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/30'
        : 'border-gray-300 hover:border-blue-400 dark:border-gray-700'}"
    >
      <span class="text-xl">&#x1F4C2;</span>
      <span class="text-gray-600 dark:text-gray-400"
        >Drop an .html file here, or click to browse</span
      >
    </div>
    <input
      bind:this={fileInputEl}
      onchange={onFileChange}
      type="file"
      accept="text/html,.html,.htm"
      class="hidden"
    />

    <div class="mb-3 flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
      <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
      or paste
      <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
    </div>

    <div class="mb-1 flex items-center justify-between">
      <span class="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
        HTML
      </span>
      <button
        onclick={handleLoadExample}
        class="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
      >
        Load example
      </button>
    </div>
    <textarea
      bind:value={html}
      class="h-64 resize-none rounded border border-gray-200 bg-white p-3 font-mono text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
      placeholder="<details class=&quot;seg tool_call&quot;>…</details>"></textarea>

    {#if result.error}
      <p class="mt-2 text-sm text-red-600 dark:text-red-400">{result.error}</p>
    {:else if summary}
      <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">{summary}</p>
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
          onclick={handleImport}
          disabled={!result.trajectory}
          class="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 dark:disabled:bg-gray-600 dark:disabled:text-gray-400"
        >
          Import
        </button>
      </div>
    </div>
  </div>
</dialog>
