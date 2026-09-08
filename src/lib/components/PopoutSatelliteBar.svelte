<script>
  /**
   * Chrome shown at the top of a satellite (popped-out) window in place of the page header: which
   * pane this is, whether the main window is still reachable, and a way back. The only place
   * `bringBack()` is called from - `window.close()` on an unrelated window otherwise silently
   * no-ops, so the button only renders while connected.
   *
   * @typedef {Object} PopoutSatelliteBarProps
   * @property {string} label - Pane name, e.g. "Preview".
   * @property {boolean} connected - Whether the main window is currently reachable.
   * @property {() => void} onreturn - Called when the user asks to bring the pane back.
   * @property {import('svelte').Snippet} [actions] - The same toolbar-actions snippet the tool
   *   renders in its main-window toolbar, so a popped-out pane keeps whatever controls write to it
   *   (e.g. Clear, Format) - each button gates its own `disabled` on which window currently hosts
   *   the data it writes, so rendering the identical snippet in both places is correct in both.
   */

  /** @type {PopoutSatelliteBarProps} */
  let { label, connected, onreturn, actions } = $props();
</script>

<div
  class="flex shrink-0 items-center gap-3 border-b border-gray-200 px-3 py-2 dark:border-gray-700"
>
  <span class="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
    {label}
  </span>
  <span class="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
    <span
      class="inline-block h-2 w-2 rounded-full {connected
        ? 'bg-green-500'
        : 'bg-gray-300 dark:bg-gray-600'}"
    ></span>
    {connected ? 'Connected' : 'Main window not found'}
  </span>
  {#if actions}
    <div class="ml-auto flex items-center gap-1">
      {@render actions()}
    </div>
  {/if}
  {#if connected}
    <button
      onclick={onreturn}
      class="{actions
        ? ''
        : 'ml-auto'} rounded border border-gray-200 px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
    >
      ↩ Return to main window
    </button>
  {/if}
</div>
