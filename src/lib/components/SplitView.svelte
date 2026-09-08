<script>
  /**
   * @typedef {Object} SplitViewProps
   * @property {import('svelte').Snippet} first - Editor pane content.
   * @property {import('svelte').Snippet} second - Preview/output pane content.
   * @property {import('svelte').Snippet} [actions] - Tool-specific toolbar buttons (right-aligned).
   * @property {import('svelte').Snippet} [status] - Status bar content.
   * @property {number} [minRatio] - Lower clamp for the first pane's size fraction.
   * @property {number} [maxRatio] - Upper clamp for the first pane's size fraction.
   * @property {'first' | 'second' | null} [poppedId] - Which pane, if any, is popped out into its
   *   own window and should be hidden here. The pop-out button itself lives in that pane's own
   *   header (each tool defines it), not in this component.
   * @property {string} [firstLabel] - Human name for the first pane, used only in the "open in
   *   another window" toolbar note.
   * @property {string} [secondLabel] - Human name for the second pane, same use.
   */

  /** @type {SplitViewProps} */
  let {
    first,
    second,
    actions,
    status,
    minRatio = 0.15,
    maxRatio = 0.85,
    poppedId = null,
    firstLabel = 'First',
    secondLabel = 'Second'
  } = $props();

  let viewMode = $state(/** @type {'editor' | 'split' | 'preview'} */ ('split'));

  // Display-only: never assigned into, so bringing a popped pane back restores exactly the
  // split/editor/preview mode the user had chosen before - same "derive, don't overwrite" approach
  // DiffLayout.svelte takes for its own focus mode.
  let effectiveViewMode = $derived(
    poppedId === 'first' ? 'preview' : poppedId === 'second' ? 'editor' : viewMode
  );

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
    {#if poppedId === null}
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
          title={layout === 'horizontal'
            ? 'Swap left and right panes'
            : 'Swap top and bottom panes'}
          class="rounded border border-gray-200 px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
        >
          {layout === 'horizontal' ? '⇄ Swap' : '⇅ Swap'}
        </button>
      {/if}
    {:else}
      <span class="text-xs text-gray-400 dark:text-gray-500">
        {poppedId === 'first' ? firstLabel : secondLabel} is open in another window
      </span>
    {/if}

    {#if actions}
      <div class="ml-auto flex items-center gap-1">
        {@render actions()}
      </div>
    {/if}
  </div>

  <!-- Panes container -->
  <div
    bind:this={panesEl}
    class="flex min-h-0 flex-1 {effectiveViewMode === 'split' ? directionClass : ''}"
  >
    {#if effectiveViewMode !== 'preview'}
      <div
        class="flex min-h-0 min-w-0 flex-col overflow-hidden {effectiveViewMode !== 'split'
          ? 'flex-1'
          : ''}"
        style={effectiveViewMode === 'split' ? `flex: 0 0 ${ratio * 100}%` : undefined}
      >
        {@render first()}
      </div>
    {/if}

    {#if effectiveViewMode === 'split'}
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

    {#if effectiveViewMode !== 'editor'}
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
