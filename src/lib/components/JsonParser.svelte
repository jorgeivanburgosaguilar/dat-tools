<script>
  import { untrack } from 'svelte';
  import { parseJson, countJsonStats, DEFAULT_CONTENT } from '$lib/json-parser.js';
  import { loadWrapPreference, saveWrapPreference } from '$lib/wrap-preference.js';
  import JsonNode from '$lib/components/JsonNode.svelte';
  import SplitView from '$lib/components/SplitView.svelte';
  import CodeEditorPane from '$lib/components/CodeEditorPane.svelte';

  /**
   * @typedef {Object} JsonParserProps
   * @property {string} [initialContent]
   */

  /** @type {JsonParserProps} */
  let { initialContent = '' } = $props();

  let input = $state(untrack(() => initialContent));
  let wrap = $state(untrack(() => loadWrapPreference('json-validator')));

  let copied = $state(false);

  let parseResult = $derived(parseJson(input));
  let stats = $derived(countJsonStats(input));

  $effect(() => {
    saveWrapPreference('json-validator', wrap);
  });

  function loadSample() {
    input = DEFAULT_CONTENT;
  }

  function formatJson() {
    if (parseResult.success) {
      input = parseResult.formatted;
    }
  }

  function minifyJson() {
    if (parseResult.success) {
      input = parseResult.minified;
    }
  }

  function clear() {
    input = '';
  }

  async function copyInput() {
    if (!input) return;
    await navigator.clipboard.writeText(input);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }
</script>

<SplitView>
  {#snippet first()}
    <CodeEditorPane
      label="Input"
      bind:value={input}
      bind:wrap
      placeholder="Paste your JSON here..."
    >
      {#snippet headerExtra()}
        {#if input.trim()}
          <span class="flex items-center gap-1 text-xs font-medium">
            {#if parseResult.success}
              <span class="inline-block h-2 w-2 rounded-full bg-green-500"></span>
              <span class="text-green-600 dark:text-green-400">Valid</span>
            {:else}
              <span class="inline-block h-2 w-2 rounded-full bg-red-500"></span>
              <span class="text-red-600 dark:text-red-400">Invalid</span>
            {/if}
          </span>
        {/if}
      {/snippet}
    </CodeEditorPane>
  {/snippet}

  {#snippet second()}
    <div class="flex items-center border-b border-gray-200 px-3 py-2 dark:border-gray-700">
      <span class="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400"
        >Output</span
      >
    </div>
    <div class="flex-1 overflow-y-auto bg-white p-4 dark:bg-gray-900">
      {#if !input.trim()}
        <p class="text-sm text-gray-500">
          Paste JSON on the left to see the formatted output here.
        </p>
      {:else if parseResult.success}
        <div class="py-0">
          <JsonNode value={parseResult.data} depth={0} isLast={true} keyName={null} />
        </div>
      {:else}
        <div
          class="rounded border border-red-300 bg-red-50 p-3 dark:border-red-700 dark:bg-red-900/30"
        >
          <p class="text-sm font-medium text-red-800 dark:text-red-300">
            Invalid JSON — {parseResult.errors.length} error{parseResult.errors.length > 1
              ? 's'
              : ''}
          </p>
          <ul class="mt-2 space-y-1.5">
            {#each parseResult.errors as err, i (i)}
              <li class="text-sm text-red-700 dark:text-red-400">
                {#if err.line !== null}
                  <span class="font-mono text-xs text-red-500 dark:text-red-500"
                    >Ln {err.line}, Col {err.column}</span
                  >
                  —
                {/if}
                {err.message}
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>
  {/snippet}

  {#snippet actions()}
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
      onclick={minifyJson}
      disabled={!parseResult.success}
      class="rounded px-2 py-1 text-xs font-medium transition-colors {parseResult.success
        ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100'
        : 'cursor-not-allowed text-gray-300 dark:text-gray-600'}"
    >
      Minify
    </button>
    <button
      onclick={copyInput}
      disabled={!input}
      class="rounded px-2 py-1 text-xs font-medium transition-colors {input
        ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100'
        : 'cursor-not-allowed text-gray-300 dark:text-gray-600'}"
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
    <button
      onclick={loadSample}
      class="rounded px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
    >
      Sample
    </button>
    <button
      onclick={clear}
      class="rounded px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
    >
      Clear
    </button>
  {/snippet}

  {#snippet status()}
    {stats.lines} lines · {stats.chars} characters
  {/snippet}
</SplitView>
