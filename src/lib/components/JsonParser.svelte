<script>
  import { untrack } from 'svelte';
  import { parseJson, countJsonStats, DEFAULT_CONTENT } from '$lib/json-parser.js';

  /**
   * @typedef {Object} JsonParserProps
   * @property {string} [initialContent]
   */

  /** @type {JsonParserProps} */
  let { initialContent = '' } = $props();

  let input = $state(untrack(() => initialContent));

  /** @type {'editor' | 'split' | 'preview'} */
  let viewMode = $state('split');

  /** @type {'horizontal' | 'vertical'} */
  let layout = $state('horizontal');

  /** @type {'' | 'formatted' | 'minified'} */
  let copied = $state('');

  /** @type {HTMLTextAreaElement | null} */
  let textareaEl = $state(null);
  /** @type {HTMLDivElement | null} */
  let gutterEl = $state(null);

  let parseResult = $derived(parseJson(input));
  let stats = $derived(countJsonStats(input));
  let lineCount = $derived(stats.lines || 1);

  function syncGutter() {
    if (gutterEl && textareaEl) gutterEl.scrollTop = textareaEl.scrollTop;
  }

  function loadSample() {
    input = DEFAULT_CONTENT;
  }

  function formatJson() {
    if (parseResult.success) {
      input = parseResult.formatted;
    }
  }

  function clear() {
    input = '';
  }

  async function copyFormatted() {
    if (!parseResult.success) return;
    await navigator.clipboard.writeText(parseResult.formatted);
    copied = 'formatted';
    setTimeout(() => (copied = ''), 1500);
  }

  async function copyMinified() {
    if (!parseResult.success) return;
    await navigator.clipboard.writeText(parseResult.minified);
    copied = 'minified';
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
        onclick={loadSample}
        class="rounded px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
      >
        Sample
      </button>
      <button
        onclick={formatJson}
        disabled={!parseResult.success}
        class="rounded px-2 py-1 text-xs font-medium transition-colors {parseResult.success
          ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100'
          : 'cursor-not-allowed text-gray-300 dark:text-gray-600'}"
      >
        Format
      </button>
      <button
        onclick={clear}
        class="rounded px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
      >
        Clear
      </button>
      <button
        onclick={copyFormatted}
        disabled={!parseResult.success}
        class="rounded px-2 py-1 text-xs font-medium transition-colors {parseResult.success
          ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100'
          : 'cursor-not-allowed text-gray-300 dark:text-gray-600'}"
      >
        {copied === 'formatted' ? '✓ Copied' : 'Copy Formatted'}
      </button>
      <button
        onclick={copyMinified}
        disabled={!parseResult.success}
        class="rounded px-2 py-1 text-xs font-medium transition-colors {parseResult.success
          ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100'
          : 'cursor-not-allowed text-gray-300 dark:text-gray-600'}"
      >
        {copied === 'minified' ? '✓ Copied' : 'Copy Minified'}
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
            >Input</span
          >
        </div>
        <div class="flex min-h-0 flex-1 overflow-hidden bg-gray-900">
          <!-- gutter -->
          <div
            bind:this={gutterEl}
            aria-hidden="true"
            class="overflow-hidden py-4 pr-2 pl-3 font-mono text-sm leading-5 text-gray-600 select-none"
          >
            {#each { length: lineCount } as _, i (i)}
              <div class="text-right">{i + 1}</div>
            {/each}
          </div>
          <!-- editor -->
          <textarea
            bind:this={textareaEl}
            bind:value={input}
            onscroll={syncGutter}
            class="flex-1 resize-none bg-transparent py-4 pr-4 font-mono text-sm leading-5 text-gray-100 outline-none placeholder:text-gray-500"
            placeholder="Paste your JSON here..."
          ></textarea>
        </div>
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
            >Output</span
          >
        </div>
        <div class="flex-1 overflow-y-auto bg-gray-900 p-4">
          {#if !input.trim()}
            <p class="text-sm text-gray-500">
              Paste JSON on the left to see the formatted output here.
            </p>
          {:else if parseResult.success}
            <pre class="text-sm break-words whitespace-pre-wrap"><code
                class="font-mono text-gray-100">{parseResult.formatted}</code
              ></pre>
          {:else}
            <div
              class="rounded border border-red-300 bg-red-50 p-3 dark:border-red-700 dark:bg-red-900/30"
            >
              <p class="text-sm font-medium text-red-800 dark:text-red-300">Invalid JSON</p>
              <p class="mt-1 text-sm text-red-700 dark:text-red-400">
                {parseResult.error.message}
              </p>
              {#if parseResult.error.line !== null}
                <p class="mt-1 text-xs text-red-600 dark:text-red-500">
                  Line {parseResult.error.line}, Column {parseResult.error.column}
                </p>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>

  <!-- Status bar -->
  <div
    class="flex items-center gap-3 border-t border-gray-200 px-4 py-1.5 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400"
  >
    {#if input.trim()}
      <span class="flex items-center gap-1">
        {#if parseResult.success}
          <span class="inline-block h-2 w-2 rounded-full bg-green-500"></span>
          Valid
        {:else}
          <span class="inline-block h-2 w-2 rounded-full bg-red-500"></span>
          Invalid
        {/if}
      </span>
      <span class="text-gray-300 dark:text-gray-600">|</span>
    {/if}
    {stats.lines} lines · {stats.chars} characters
  </div>
</div>
