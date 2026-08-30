<script>
  /**
   * @typedef {Object} SplitViewProps
   * @property {import('svelte').Snippet} first - Editor pane content.
   * @property {import('svelte').Snippet} second - Preview/output pane content.
   * @property {import('svelte').Snippet} [actions] - Tool-specific toolbar buttons (right-aligned).
   * @property {import('svelte').Snippet} [status] - Status bar content.
   * @property {number} [minRatio] - Lower clamp for the first pane's size fraction.
   * @property {number} [maxRatio] - Upper clamp for the first pane's size fraction.
   */

  /** @type {SplitViewProps} */
  let { first, second, actions, status, minRatio = 0.15, maxRatio = 0.85 } = $props();

  let viewMode = $state(/** @type {'editor' | 'split' | 'preview'} */ ('split'));

  let layout = $state(/** @type {'horizontal' | 'vertical'} */ ('horizontal'));

  let swapped = $state(false);

  /** Fraction of the container given to the first (DOM-order) pane. */
  let ratio = $state(0.5);

  /** @type {HTMLDivElement | null} */
  let panesEl = $state(null);
  let dragging = $state(false);

  /** @param {PointerEvent} e */
  function onDividerPointerDown(e) {
    e.preventDefault();
    dragging = true;
    /** @type {HTMLElement} */ (e.currentTarget).setPointerCapture(e.pointerId);
  }

  /** @param {PointerEvent} e */
  function onDividerPointerMove(e) {
    if (!dragging || !panesEl) return;
    const rect = panesEl.getBoundingClientRect();
    const fraction =
      layout === 'vertical'
        ? (e.clientY - rect.top) / rect.height
        : (e.clientX - rect.left) / rect.width;
    // When panes are reversed the first DOM pane sits on the far side.
    const firstFraction = swapped ? 1 - fraction : fraction;
    ratio = Math.min(maxRatio, Math.max(minRatio, firstFraction));
  }

  /** @param {PointerEvent} e */
  function onDividerPointerUp(e) {
    dragging = false;
    /** @type {HTMLElement} */ (e.currentTarget).releasePointerCapture(e.pointerId);
  }

  let directionClass = $derived(
    layout === 'vertical'
      ? swapped
        ? 'flex-col-reverse'
        : 'flex-col'
      : swapped
        ? 'flex-row-reverse'
        : 'flex-row'
  );
</script>

<div class="flex h-full flex-col">
  <!-- Toolbar -->
  <div
    class="flex shrink-0 items-center gap-3 border-b border-gray-200 px-3 py-2 dark:border-gray-700"
  >
    <!-- View mode segmented control -->
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

    {#if viewMode === 'split'}
      <!-- Layout direction toggle -->
      <button
        onclick={() => (layout = layout === 'horizontal' ? 'vertical' : 'horizontal')}
        title={layout === 'horizontal'
          ? 'Switch to stacked layout'
          : 'Switch to side-by-side layout'}
        class="rounded border border-gray-200 px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
      >
        {layout === 'horizontal' ? '↕ Stack' : '↔ Side by side'}
      </button>

      <!-- Swap pane order -->
      <button
        onclick={() => (swapped = !swapped)}
        title={layout === 'horizontal' ? 'Swap left and right panes' : 'Swap top and bottom panes'}
        class="rounded border border-gray-200 px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
      >
        {layout === 'horizontal' ? '⇄ Swap' : '⇅ Swap'}
      </button>
    {/if}

    {#if actions}
      <div class="ml-auto flex items-center gap-1">
        {@render actions()}
      </div>
    {/if}
  </div>

  <!-- Panes container -->
  <div bind:this={panesEl} class="flex min-h-0 flex-1 {viewMode === 'split' ? directionClass : ''}">
    {#if viewMode !== 'preview'}
      <div
        class="flex min-h-0 min-w-0 flex-col overflow-hidden {viewMode !== 'split' ? 'flex-1' : ''}"
        style={viewMode === 'split' ? `flex: 0 0 ${ratio * 100}%` : undefined}
      >
        {@render first()}
      </div>
    {/if}

    {#if viewMode === 'split'}
      <!-- Draggable divider -->
      <div
        role="separator"
        aria-orientation={layout === 'horizontal' ? 'vertical' : 'horizontal'}
        aria-label="Resize panes"
        tabindex="-1"
        onpointerdown={onDividerPointerDown}
        onpointermove={onDividerPointerMove}
        onpointerup={onDividerPointerUp}
        class="shrink-0 bg-gray-200 transition-colors hover:bg-blue-400 dark:bg-gray-700 dark:hover:bg-blue-500
          {layout === 'horizontal' ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'}
          {dragging ? 'bg-blue-400 dark:bg-blue-500' : ''}"
      ></div>
    {/if}

    {#if viewMode !== 'editor'}
      <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {@render second()}
      </div>
    {/if}
  </div>

  {#if status}
    <!-- Status bar -->
    <div
      class="flex items-center gap-3 border-t border-gray-200 px-4 py-1.5 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400"
    >
      {@render status()}
    </div>
  {/if}
</div>
