<script>
  import { untrack } from 'svelte';
  import SplitView from '$lib/components/SplitView.svelte';
  import CodeEditorPane from '$lib/components/CodeEditorPane.svelte';
  import DiffPane from '$lib/components/DiffPane.svelte';
  import { computeDiff, collapseRows, DEFAULT_ORIGINAL, DEFAULT_CHANGED } from '$lib/text-diff.js';
  import { LANGUAGES, ensureHighlighter, highlightLines } from '$lib/syntax-highlight.js';
  import { mergeRuns } from '$lib/diff-render.js';

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
  let showWhitespace = $state(false);
  let collapseUnchanged = $state(false);
  let highlightLoading = $state(false);

  /** @type {import('$lib/syntax-highlight.js').Lowlight | null} */
  let lowlight = $state(null);

  let scrollTop = $state(0);
  let scrollLeft = $state(0);

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
    if (mode === 'diff') diff = computeDiff(original, changed);
  }

  function clearAll() {
    original = '';
    changed = '';
    mode = 'edit';
    diff = null;
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
    if (id !== 'plain') await preloadHighlighter();
  }

  let highlightRunsOriginal = $derived.by(() =>
    diff ? highlightLines(diff.originalLines, language, lowlight) : []
  );
  let highlightRunsChanged = $derived.by(() =>
    diff ? highlightLines(diff.changedLines, language, lowlight) : []
  );

  // Precomputed once per (diff, language, highlighter) change - not re-run when showWhitespace
  // is toggled or the divider is dragged, since whitespace glyphs are applied at render time.
  // A collapsed row's placeholder cells carry no line number and no segments, so mergeRuns
  // naturally reduces to an empty span list for them - no special case needed here.
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
</script>

<SplitView firstLabel="Original" secondLabel="Changed">
  {#snippet first()}
    {#if mode === 'edit'}
      <CodeEditorPane
        label="Original"
        bind:value={original}
        placeholder="Paste the original text here…"
      />
    {:else}
      <DiffPane
        label="Original"
        cells={leftCells}
        {showWhitespace}
        {scrollTop}
        {scrollLeft}
        onscroll={onPaneScroll}
      />
    {/if}
  {/snippet}

  {#snippet second()}
    {#if mode === 'edit'}
      <CodeEditorPane
        label="Changed"
        bind:value={changed}
        placeholder="Paste the changed text here…"
      />
    {:else}
      <DiffPane
        label="Changed"
        cells={rightCells}
        {showWhitespace}
        {scrollTop}
        {scrollLeft}
        onscroll={onPaneScroll}
      />
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

    <button
      onclick={() => (showWhitespace = !showWhitespace)}
      aria-pressed={showWhitespace}
      class="rounded px-2 py-1 text-xs font-medium transition-colors {showWhitespace
        ? 'bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-100'
        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100'}"
    >
      Show whitespace
    </button>

    {#if mode === 'diff'}
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

    {#if mode === 'edit'}
      <button
        onclick={runDiff}
        disabled={!canDiff}
        class="rounded px-2 py-1 text-xs font-medium transition-colors {canDiff
          ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100'
          : 'cursor-not-allowed text-gray-300 dark:text-gray-600'}"
      >
        Diff
      </button>
    {:else}
      <button
        onclick={backToEdit}
        class="rounded px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
      >
        Edit
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
</SplitView>
