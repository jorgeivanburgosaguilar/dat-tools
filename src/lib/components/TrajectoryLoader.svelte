<script>
  import { parseJson } from '$lib/json-parser.js';
  import { normalizeTrajectory, EXAMPLE_TRAJECTORY } from '$lib/agent-trajectory.js';
  import { ensureHighlighter } from '$lib/syntax-highlight.js';
  import { htmlToTrajectory, EXAMPLE_TOOL_CALLS_HTML } from '$lib/html-tool-calls.js';
  import { htmlTrajectoryToTrajectory, EXAMPLE_TRAJECTORY_HTML } from '$lib/html-trajectory.js';
  import TrajectoryHtmlImportModal from '$lib/components/TrajectoryHtmlImportModal.svelte';

  /**
   * @typedef {Object} TrajectoryLoaderProps
   * @property {(result: import('$lib/agent-trajectory.js').TrajectoryLoadResult) => void} [onload]
   */

  /** @type {TrajectoryLoaderProps} */
  let { onload = () => {} } = $props();

  let text = $state('');
  let error = $state(/** @type {string | null} */ (null));
  let loading = $state(false);
  let dragActive = $state(false);
  let showHtmlImport = $state(false);
  let showHtmlTrajectoryImport = $state(false);

  const HTML_TRAJECTORY_DESCRIPTION =
    "Drop an exported HTML trajectory page (one that embeds its data as const DATA = {…}), paste it below, or try the bundled example. It's converted into trajectory JSON and loaded into the viewer.";
  // No closing script tag: one inside this literal would end the component's own script block.
  const HTML_TRAJECTORY_PLACEHOLDER = '<script>const DATA = {"steps": […]};';

  /** @type {HTMLInputElement | null} */
  let fileInputEl = $state(null);

  /**
   * Parses, normalizes and prepares the highlighter for `content` - the one place every entry
   * point (paste + Load, drop/pick a file, Load example) funnels through. Only ever runs from a
   * click/drop handler, never from module scope or an effect, so `ensureHighlighter()`'s dynamic
   * import never fires during SvelteKit's prerender pass.
   * @param {string} content
   */
  async function load(content) {
    error = null;
    const parsed = parseJson(content);
    if (!parsed.success) {
      error = parsed.errors[0]?.message ?? 'Invalid JSON';
      return;
    }
    const normalized = normalizeTrajectory(parsed.data);
    if (!normalized.ok) {
      error = normalized.reason;
      return;
    }
    loading = true;
    try {
      const lowlight = await ensureHighlighter();
      onload({ trajectory: normalized, lowlight, json: parsed.formatted });
    } finally {
      loading = false;
    }
  }

  function loadPasted() {
    load(text);
  }

  function loadExample() {
    text = EXAMPLE_TRAJECTORY;
    load(EXAMPLE_TRAJECTORY);
  }

  /** @param {string} json */
  function importHtml(json) {
    showHtmlImport = false;
    showHtmlTrajectoryImport = false;
    text = json;
    load(json);
  }

  /** @param {File} file */
  async function loadFile(file) {
    const content = await file.text();
    text = content;
    await load(content);
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
</script>

<div class="mx-auto flex h-full max-w-2xl flex-col justify-center gap-4 overflow-y-auto p-6">
  <div class="text-center">
    <h2 class="font-mono text-[1.5em] font-bold text-gray-900 dark:text-gray-100">
      Load a trajectory
    </h2>
    <p class="mt-1 text-[1.125em] text-gray-500 dark:text-gray-400">
      Drop a trajectory JSON file, paste it below, try the bundled example, or import an exported
      HTML tool-call transcript or HTML trajectory page. Everything stays in your browser.
    </p>
  </div>

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
    class="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-6 text-[1.125em] transition-colors {dragActive
      ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/30'
      : 'border-gray-300 hover:border-blue-400 dark:border-gray-700'}"
  >
    <span class="text-[2em]">&#x1F4C2;</span>
    <span class="text-gray-600 dark:text-gray-400">Drop a .json file here, or click to browse</span>
  </div>
  <input
    bind:this={fileInputEl}
    onchange={onFileChange}
    type="file"
    accept="application/json,.json"
    class="hidden"
  />

  <div class="flex items-center gap-2 text-[1em] text-gray-400 dark:text-gray-500">
    <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
    or paste
    <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
  </div>

  <label class="sr-only" for="trajectory-paste">Paste trajectory JSON</label>
  <textarea
    id="trajectory-paste"
    bind:value={text}
    placeholder="Paste trajectory JSON here..."
    class="h-32 w-full resize-y rounded border border-gray-200 bg-white p-2 font-mono text-[1em] text-gray-900 outline-none placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
  ></textarea>

  {#if error}
    <p
      role="alert"
      class="rounded border border-red-200 bg-red-50 p-2 text-[1em] text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
    >
      {error}
    </p>
  {/if}

  <div class="flex items-center justify-center gap-2">
    <button
      onclick={loadPasted}
      disabled={!text.trim() || loading}
      class="rounded-md px-4 py-1.5 text-[1em] font-semibold transition-colors {text.trim() &&
      !loading
        ? 'bg-blue-600 text-white hover:bg-blue-700'
        : 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500'}"
    >
      {loading ? 'Loading…' : 'Load trajectory'}
    </button>
    <button
      onclick={loadExample}
      disabled={loading}
      class="rounded-md border border-gray-200 px-4 py-1.5 text-[1em] font-semibold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
    >
      Load example
    </button>
    <button
      onclick={() => (showHtmlImport = true)}
      disabled={loading}
      class="rounded-md border border-gray-200 px-4 py-1.5 text-[1em] font-semibold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
    >
      Import HTML Tool Calls
    </button>
    <button
      onclick={() => (showHtmlTrajectoryImport = true)}
      disabled={loading}
      class="rounded-md border border-gray-200 px-4 py-1.5 text-[1em] font-semibold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
    >
      Import HTML Trajectory
    </button>
  </div>
</div>

<TrajectoryHtmlImportModal
  open={showHtmlImport}
  title="Import HTML Tool Calls"
  description="Drop an exported HTML tool-call transcript, paste it below, or try the bundled example. It's converted into trajectory JSON and loaded into the viewer."
  placeholder="<details class=&quot;seg tool_call&quot;>…</details>"
  convert={htmlToTrajectory}
  example={EXAMPLE_TOOL_CALLS_HTML}
  onimport={importHtml}
  onclose={() => (showHtmlImport = false)}
/>

<TrajectoryHtmlImportModal
  open={showHtmlTrajectoryImport}
  title="Import HTML Trajectory"
  description={HTML_TRAJECTORY_DESCRIPTION}
  placeholder={HTML_TRAJECTORY_PLACEHOLDER}
  convert={htmlTrajectoryToTrajectory}
  example={EXAMPLE_TRAJECTORY_HTML}
  onimport={importHtml}
  onclose={() => (showHtmlTrajectoryImport = false)}
/>
