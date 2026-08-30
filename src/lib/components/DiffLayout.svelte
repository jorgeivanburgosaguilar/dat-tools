<script>
  /**
   * Diff-owned layout for 2 or 3 panes, generalizing the two-pane `SplitView` used by the other
   * tools. `SplitView` itself stays untouched (JsonParser / MarkdownPreview only ever need two
   * panes with a simple swap), so this component owns its own segmented control, pane ordering
   * and resizable dividers instead of trying to grow `SplitView` into something it isn't used for
   * elsewhere.
   */

  /**
   * @typedef {Object} LayoutPane
   * @property {string} id - Stable key; also the focus-mode identity.
   * @property {string} label - Segmented-control label.
   * @property {import('svelte').Snippet} render
   */

  /**
   * @typedef {Object} DiffLayoutProps
   * @property {LayoutPane[]} panes - 2 or 3 entries.
   * @property {import('svelte').Snippet} [primary] - Centered primary action.
   * @property {import('svelte').Snippet} [actions] - Right-aligned toolbar controls.
   * @property {import('svelte').Snippet} [status] - Status bar content.
   * @property {number} [minRatio] - Lower clamp for a pane's size fraction.
   */

  /** @type {DiffLayoutProps} */
  let { panes, primary, actions, status, minRatio = 0.15 } = $props();

  // Pane-order permutations, keyed by pane count. Cycling through these is what "Swap" does;
  // for 3 panes it goes source-first -> reversed -> source-in-the-middle, per the layout the
  // Diff Checker asked for (Source / Original / Changed).
  const CYCLES = /** @type {Record<number, number[][]>} */ ({
    2: [
      [0, 1],
      [1, 0]
    ],
    3: [
      [0, 1, 2],
      [2, 1, 0],
      [1, 0, 2]
    ]
  });

  let layout = $state(/** @type {'horizontal' | 'vertical'} */ ('horizontal'));
  let focus = $state(/** @type {string | null} */ (null));
  let order = $state(0);

  /** @type {HTMLDivElement | null} */
  let panesEl = $state(null);
  let draggingIndex = $state(/** @type {number | null} */ (null));

  // A focus id from before a pane was removed (e.g. the Source pane toggled off) simply stops
  // matching here, so the view falls back to split with no reset logic needed.
  let focusedPane = $derived(panes.find((p) => p.id === focus) ?? null);

  let cycle = $derived(
    CYCLES[panes.length] ?? [panes.map((/** @type {unknown} */ _, /** @type {number} */ i) => i)]
  );
  let perm = $derived(cycle[order % cycle.length]);
  let displayPanes = $derived(perm.map((i) => panes[i]));

  /** @param {number} n */
  function equalSizes(n) {
    return Array.from({ length: n }, () => 1 / n);
  }

  // Kept in *pane order* (not display order) so a pane keeps its width across a Swap. Resets to
  // equal fractions automatically whenever the pane count changes, via this fallback rather than
  // an effect - any explicit drag write below always produces an array of the current length.
  let sizesState = $state(/** @type {number[]} */ ([]));
  let sizes = $derived(sizesState.length === panes.length ? sizesState : equalSizes(panes.length));
  let displaySizes = $derived(perm.map((i) => sizes[i]));

  /**
   * @param {PointerEvent} e
   * @param {number} d
   */
  function onDividerPointerDown(e, d) {
    e.preventDefault();
    draggingIndex = d;
    /** @type {HTMLElement} */ (e.currentTarget).setPointerCapture(e.pointerId);
  }

  /**
   * Drags the boundary between display panes `d` and `d+1` only - every other pane's size is
   * left untouched, so a middle divider never disturbs panes it doesn't border.
   * @param {PointerEvent} e
   * @param {number} d
   */
  function onDividerPointerMove(e, d) {
    if (draggingIndex !== d || !panesEl) return;
    const rect = panesEl.getBoundingClientRect();
    const fraction =
      layout === 'vertical'
        ? (e.clientY - rect.top) / rect.height
        : (e.clientX - rect.left) / rect.width;

    const prevBoundary = displaySizes.slice(0, d).reduce((a, b) => a + b, 0);
    const pairSpan = displaySizes[d] + displaySizes[d + 1];
    if (pairSpan <= 0) return;
    const minLocal = Math.min(0.5, minRatio / pairSpan);
    const local = Math.min(1 - minLocal, Math.max(minLocal, (fraction - prevBoundary) / pairSpan));

    const newSizes = sizes.slice();
    newSizes[perm[d]] = local * pairSpan;
    newSizes[perm[d + 1]] = pairSpan - newSizes[perm[d]];
    sizesState = newSizes;
  }

  /** @param {PointerEvent} e */
  function onDividerPointerUp(e) {
    draggingIndex = null;
    /** @type {HTMLElement} */ (e.currentTarget).releasePointerCapture(e.pointerId);
  }

  /** @param {boolean} active */
  function segClass(active) {
    return active
      ? 'bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-100'
      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200';
  }

  let nextOrderTitle = $derived(
    `Show: ${cycle[(order + 1) % cycle.length].map((i) => panes[i]?.label).join(' · ')}`
  );
</script>

<div class="flex h-full flex-col">
  <!-- Toolbar: 3-column grid keeps the primary action centered regardless of how wide either side is -->
  <div
    class="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-gray-200 px-3 py-2 dark:border-gray-700"
  >
    <div class="flex items-center gap-3">
      <div class="flex overflow-hidden rounded border border-gray-200 text-xs dark:border-gray-700">
        <button
          onclick={() => (focus = null)}
          class="px-2.5 py-1 font-medium transition-colors {segClass(focusedPane === null)}"
        >
          Split
        </button>
        {#each panes as pane (pane.id)}
          <button
            onclick={() => (focus = pane.id)}
            class="border-l border-gray-200 px-2.5 py-1 font-medium transition-colors dark:border-gray-700 {segClass(
              focusedPane?.id === pane.id
            )}"
          >
            {pane.label}
          </button>
        {/each}
      </div>

      {#if focusedPane === null}
        <button
          onclick={() => (layout = layout === 'horizontal' ? 'vertical' : 'horizontal')}
          title={layout === 'horizontal'
            ? 'Switch to stacked layout'
            : 'Switch to side-by-side layout'}
          class="rounded border border-gray-200 px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
        >
          {layout === 'horizontal' ? '↕ Stack' : '↔ Side by side'}
        </button>

        {#if panes.length > 1}
          <button
            onclick={() => (order = order + 1)}
            title={nextOrderTitle}
            class="rounded border border-gray-200 px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
          >
            {layout === 'horizontal' ? '⇄ Swap' : '⇅ Swap'}
          </button>
        {/if}
      {/if}
    </div>

    <div class="justify-self-center">
      {@render primary?.()}
    </div>

    <div class="flex items-center gap-1 justify-self-end">
      {@render actions?.()}
    </div>
  </div>

  <!-- Panes container -->
  <div
    bind:this={panesEl}
    class="flex min-h-0 flex-1 {focusedPane === null && layout === 'vertical' ? 'flex-col' : ''}"
  >
    {#if focusedPane}
      <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {@render focusedPane.render()}
      </div>
    {:else}
      {#each displayPanes as pane, i (pane.id)}
        <div
          class="flex min-h-0 min-w-0 flex-col overflow-hidden"
          style="flex: 0 0 {displaySizes[i] * 100}%"
        >
          {@render pane.render()}
        </div>
        {#if i < displayPanes.length - 1}
          <div
            role="separator"
            aria-orientation={layout === 'horizontal' ? 'vertical' : 'horizontal'}
            aria-label="Resize panes"
            tabindex="-1"
            onpointerdown={(e) => onDividerPointerDown(e, i)}
            onpointermove={(e) => onDividerPointerMove(e, i)}
            onpointerup={onDividerPointerUp}
            class="shrink-0 bg-gray-200 transition-colors hover:bg-blue-400 dark:bg-gray-700 dark:hover:bg-blue-500
              {layout === 'horizontal' ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'}
              {draggingIndex === i ? 'bg-blue-400 dark:bg-blue-500' : ''}"
          ></div>
        {/if}
      {/each}
    {/if}
  </div>

  {#if status}
    <div
      class="flex items-center gap-3 border-t border-gray-200 px-4 py-1.5 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400"
    >
      {@render status()}
    </div>
  {/if}
</div>
