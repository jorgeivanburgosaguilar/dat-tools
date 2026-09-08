<script>
  /**
   * The parsed/formatted JSON output pane, extracted out of `JsonParser.svelte` so it can be
   * rendered on its own inside a satellite (popped-out) window as well as inline in the main split
   * view - a Svelte snippet (what this used to be) can't cross a document boundary, but a component
   * can be mounted in either window.
   *
   * Read-only: `parseResult` is recomputed independently in whichever window renders this (parsing
   * is a pure function of `input`, so both windows converge on the same tree) - this pane never
   * writes back to `shared`.
   */

  import JsonNode from './JsonNode.svelte';
  import PopoutButton from './PopoutButton.svelte';

  /**
   * @typedef {Object} JsonOutputPaneProps
   * @property {import('$lib/json-parser.js').ParseSuccess | import('$lib/json-parser.js').ParseError} parseResult
   * @property {boolean} hasInput - Whether there's any input text at all, to distinguish "nothing
   *   pasted yet" from a parse error.
   * @property {() => void} [onpopout] - Omit to hide the pop-out button.
   */

  /** @type {JsonOutputPaneProps} */
  let { parseResult, hasInput, onpopout } = $props();
</script>

<div
  class="flex items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-gray-700"
>
  <span class="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400"
    >Output</span
  >
  {#if onpopout}
    <PopoutButton label="Output" onclick={onpopout} />
  {/if}
</div>
<div class="flex-1 overflow-y-auto bg-white p-4 dark:bg-gray-900">
  {#if !hasInput}
    <p class="text-sm text-gray-500">Paste JSON on the left to see the formatted output here.</p>
  {:else if parseResult.success}
    <div class="py-0">
      <JsonNode value={parseResult.data} depth={0} isLast={true} keyName={null} />
    </div>
  {:else}
    <div class="rounded border border-red-300 bg-red-50 p-3 dark:border-red-700 dark:bg-red-900/30">
      <p class="text-sm font-medium text-red-800 dark:text-red-300">
        Invalid JSON — {parseResult.errors.length} error{parseResult.errors.length > 1 ? 's' : ''}
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
