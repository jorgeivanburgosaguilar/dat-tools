<script>
  /**
   * Toolbar button that opens (or focuses) a pane in its own browser window. Purely presentational -
   * the actual window/channel wiring lives in `$lib/popout.js` and `$lib/popout-sync.js`; this
   * component just renders the control and forwards the click.
   *
   * @typedef {Object} PopoutButtonProps
   * @property {string} label - Pane name shown in the tooltip, e.g. "Preview".
   * @property {() => void} onclick
   * @property {boolean} [disabled]
   */

  /** @type {PopoutButtonProps} */
  let { label, onclick, disabled = false } = $props();
</script>

<button
  {onclick}
  {disabled}
  title={disabled ? `${label} is already open in another window` : `Open ${label} in a new window`}
  aria-label={`Open ${label} in a new window`}
  class="rounded border border-gray-200 px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
>
  ⧉
</button>
