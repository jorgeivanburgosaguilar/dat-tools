<script>
  import { untrack } from 'svelte';
  import DiffLayout from '$lib/components/DiffLayout.svelte';
  import CodeEditorPane from '$lib/components/CodeEditorPane.svelte';
  import DiffPane from '$lib/components/DiffPane.svelte';
  import { computeDiff, collapseRows, DEFAULT_ORIGINAL, DEFAULT_CHANGED } from '$lib/text-diff.js';
  import {
    LANGUAGES,
    ensureHighlighter,
    highlightLines,
    detectLanguage
  } from '$lib/syntax-highlight.js';
  import { mergeRuns } from '$lib/diff-render.js';
  import { maxRowHeights } from '$lib/line-gutter.js';
  import { loadWrapPreference, saveWrapPreference } from '$lib/wrap-preference.js';

  /**
   * @typedef {Object} DiffCheckerProps
   * @property {string} [initialOriginal]
   * @property {string} [initialChanged]
   */

  /** @type {DiffCheckerProps} */
  let { initialOriginal = '', initialChanged = '' } = $props();

  let original = $state(untrack(() => initialOriginal));
  let changed = $state(untrack(() => initialChanged));

  /** @type {'edit' | 'diff'} */
  let mode = $state('edit');

  /** @type {import('$lib/text-diff.js').DiffResult | null} */
  let diff = $state(null);

  let language = $state('plain');
  let languageIsManual = $state(false);
  let collapseUnchanged = $state(false);
  let showSource = $state(false);
  let highlightLoading = $state(false);

  /** @type {import('$lib/syntax-highlight.js').Lowlight | null} */
  let lowlight = $state(null);

  let scrollTop = $state(0);
  let scrollLeft = $state(0);

  let wrap = $state(untrack(() => loadWrapPreference('diff-checker')));

  // Each diff-mode DiffPane reports its own natural (unclamped) row heights here, keyed by pane
  // id; merged below into one array so a row pair stays level even when only one side wraps.
  /** @type {Record<string, number[]>} */
  let paneRowHeights = $state({});
  let rowHeights = $derived(maxRowHeights(Object.values(paneRowHeights)));

  $effect(() => {
    saveWrapPreference('diff-checker', wrap);
  });

  /**
   * @param {string} id
   * @param {number[]} heights
   */
  function onPaneMeasure(id, heights) {
    paneRowHeights = { ...paneRowHeights, [id]: heights };
  }

  // Diffing is an explicit, user-triggered action (not $derived / not an $effect): typing must
  // never recompute the diff, and nothing here may run during SvelteKit's prerender pass either.
  let canDiff = $derived(original !== '' || changed !== '');

  /**
   * @param {number} t
   * @param {number} l
   */
  function onPaneScroll(t, l) {
    scrollTop = t;
    scrollLeft = l;
  }

  function runDiff() {
    diff = computeDiff(original, changed);
    mode = 'diff';
    scrollTop = 0;
    scrollLeft = 0;
    if (!languageIsManual) autoDetectLanguage();
  }

  function backToEdit() {
    mode = 'edit';
  }

  function swapTexts() {
    const tmp = original;
    original = changed;
    changed = tmp;
    if (mode === 'diff') diff = computeDiff(original, changed);
  }

  function loadSample() {
    original = DEFAULT_ORIGINAL;
    changed = DEFAULT_CHANGED;
    languageIsManual = false;
    if (mode === 'diff') diff = computeDiff(original, changed);
  }

  function clearAll() {
    original = '';
    changed = '';
    mode = 'edit';
    diff = null;
    showSource = false;
    languageIsManual = false;
  }

  /** Kicks off the lowlight chunk fetch early so it can overlap the user picking a language. */
  async function preloadHighlighter() {
    if (lowlight || highlightLoading) return;
    highlightLoading = true;
    try {
      lowlight = await ensureHighlighter();
    } finally {
      highlightLoading = false;
    }
  }

  /** @param {string} id */
  async function selectLanguage(id) {
    language = id;
    languageIsManual = true;
    if (id !== 'plain') await preloadHighlighter();
  }

  /**
   * Guesses a language from the current text when Find Difference is clicked and the user hasn't
   * picked one manually. Fire-and-forget, same pattern as `preloadHighlighter()`; only ever runs
   * from inside an explicit user action, never from module scope or an effect.
   */
  function autoDetectLanguage() {
    const sample = original || changed;
    if (!sample) return;
    highlightLoading = true;
    ensureHighlighter()
      .then((instance) => {
        lowlight = instance;
        if (languageIsManual) return; // user picked one while the chunk was loading
        const detected = detectLanguage(sample, instance);
        if (detected) language = detected;
      })
      .finally(() => {
        highlightLoading = false;
      });
  }

  let highlightRunsOriginal = $derived.by(() =>
    diff ? highlightLines(diff.originalLines, language, lowlight) : []
  );
  let highlightRunsChanged = $derived.by(() =>
    diff ? highlightLines(diff.changedLines, language, lowlight) : []
  );

  // Precomputed once per (diff, language, highlighter) change - whitespace glyphs are applied at
  // render time, so this doesn't need to re-run when the divider is dragged or the pane layout
  // changes. A collapsed row's placeholder cells carry no line number and no segments, so
  // mergeRuns naturally reduces to an empty span list for them - no special case needed here.
  let renderRows = $derived.by(() => {
    if (!diff) return [];
    const rows = collapseUnchanged ? collapseRows(diff.rows, 3) : diff.rows;
    return rows.map((row) => {
      const { left, right } = row;
      const leftRuns = left.lineNumber !== null ? highlightRunsOriginal[left.lineNumber - 1] : null;
      const rightRuns =
        right.lineNumber !== null ? highlightRunsChanged[right.lineNumber - 1] : null;
      return {
        left: {
          lineNumber: left.lineNumber,
          type: left.type,
          hasEol: left.hasEol,
          spans: mergeRuns(left.segments, leftRuns),
          count: row.count
        },
        right: {
          lineNumber: right.lineNumber,
          type: right.type,
          hasEol: right.hasEol,
          spans: mergeRuns(right.segments, rightRuns),
          count: row.count
        }
      };
    });
  });

  let leftCells = $derived(renderRows.map((r) => r.left));
  let rightCells = $derived(renderRows.map((r) => r.right));

  // The raw-original pane reuses the already-merged left cells (no second diff or highlight
  // pass): only the red/green diff coloring is stripped from each span, so syntax highlighting
  // and structural filler/collapsed rows (which keep all panes aligned and scroll-locked) survive.
  let sourceCells = $derived(
    renderRows.map((r) => {
      const cell = r.left;
      return {
        lineNumber: cell.lineNumber,
        type:
          cell.type === 'added' || cell.type === 'removed'
            ? /** @type {'equal'} */ ('equal')
            : cell.type,
        hasEol: cell.hasEol,
        spans: cell.spans.map((s) => ({ ...s, diff: /** @type {'equal'} */ ('equal') })),
        count: cell.count
      };
    })
  );
</script>

{#snippet originalEditor()}
  <CodeEditorPane
    label="Original"
    bind:value={original}
    bind:wrap
    placeholder="Paste the original text here…"
  />
{/snippet}

{#snippet changedEditor()}
  <CodeEditorPane
    label="Changed"
    bind:value={changed}
    bind:wrap
    placeholder="Paste the changed text here…"
  />
{/snippet}

{#snippet sourcePane()}
  <DiffPane
    label="Source"
    headerTitle="Original text, no diff highlighting"
    cells={sourceCells}
    {scrollTop}
    {scrollLeft}
    onscroll={onPaneScroll}
    {wrap}
    {rowHeights}
    onmeasure={(heights) => onPaneMeasure('source', heights)}
  />
{/snippet}

{#snippet originalDiffPane()}
  <DiffPane
    label="Original"
    cells={leftCells}
    {scrollTop}
    {scrollLeft}
    onscroll={onPaneScroll}
    {wrap}
    {rowHeights}
    onmeasure={(heights) => onPaneMeasure('original', heights)}
  />
{/snippet}

{#snippet changedDiffPane()}
  <DiffPane
    label="Changed"
    cells={rightCells}
    {scrollTop}
    {scrollLeft}
    onscroll={onPaneScroll}
    {wrap}
    {rowHeights}
    onmeasure={(heights) => onPaneMeasure('changed', heights)}
  />
{/snippet}

{#snippet primary()}
  {#if mode === 'edit'}
    <button
      onclick={runDiff}
      disabled={!canDiff}
      class="rounded-md px-4 py-1.5 text-xs font-semibold transition-colors {canDiff
        ? 'bg-green-600 text-white hover:bg-green-700'
        : 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500'}"
    >
      Find Difference
    </button>
  {:else}
    <button
      onclick={backToEdit}
      class="rounded-md border border-gray-200 px-4 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
    >
      Edit Texts
    </button>
  {/if}
{/snippet}

{#snippet actions()}
  <select
    value={language}
    onfocus={preloadHighlighter}
    onchange={(e) => selectLanguage(/** @type {HTMLSelectElement} */ (e.currentTarget).value)}
    class="rounded border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
  >
    {#each LANGUAGES as lang (lang.id)}
      <option value={lang.id}>{lang.label}</option>
    {/each}
  </select>
  {#if highlightLoading}
    <span class="text-xs text-gray-400 dark:text-gray-500">Loading…</span>
  {/if}

  {#if mode === 'diff'}
    <button
      onclick={() => (wrap = !wrap)}
      aria-pressed={wrap}
      title="Wrap long lines"
      class="rounded px-2 py-1 text-xs font-medium transition-colors {wrap
        ? 'bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-100'
        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100'}"
    >
      Wrap
    </button>
    <button
      onclick={() => (collapseUnchanged = !collapseUnchanged)}
      aria-pressed={collapseUnchanged}
      class="rounded px-2 py-1 text-xs font-medium transition-colors {collapseUnchanged
        ? 'bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-100'
        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100'}"
    >
      Collapse unchanged
    </button>
  {/if}

  <button
    onclick={swapTexts}
    title="Swap the Original and Changed text"
    class="rounded px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
  >
    Swap texts
  </button>
  <button
    onclick={loadSample}
    class="rounded px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
  >
    Sample
  </button>
  <button
    onclick={clearAll}
    class="rounded px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
  >
    Clear
  </button>

  {#if mode === 'diff'}
    <button
      onclick={() => (showSource = !showSource)}
      aria-pressed={showSource}
      title="Show the original text with no diff highlighting, as a third pane"
      class="rounded px-2 py-1 text-xs font-medium transition-colors {showSource
        ? 'bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-100'
        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100'}"
    >
      Source pane
    </button>
  {/if}
{/snippet}

{#snippet status()}
  {#if mode === 'edit'}
    {original.split('\n').length} / {changed.split('\n').length} lines
  {:else if diff}
    {#if diff.stats.tooLarge}
      Input is too large to diff (over 2,000,000 characters combined).
    {:else if diff.stats.identical}
      Texts are identical.
    {:else}
      +{diff.stats.linesAdded} −{diff.stats.linesRemoved} lines · +{diff.stats.charsAdded} −{diff
        .stats.charsRemoved} characters
      {#if diff.stats.eolMismatch}
        · line endings differ
      {/if}
      {#if diff.stats.trailingNewline.original !== diff.stats.trailingNewline.changed}
        · trailing newline differs
      {/if}
      {#if diff.stats.aborted}
        · diff was too complex and was simplified
      {/if}
    {/if}
  {/if}
{/snippet}

<DiffLayout
  panes={mode === 'edit'
    ? [
        { id: 'original', label: 'Original', render: originalEditor },
        { id: 'changed', label: 'Changed', render: changedEditor }
      ]
    : [
        ...(showSource ? [{ id: 'source', label: 'Source', render: sourcePane }] : []),
        { id: 'original', label: 'Original', render: originalDiffPane },
        { id: 'changed', label: 'Changed', render: changedDiffPane }
      ]}
  {primary}
  {actions}
  {status}
/>
