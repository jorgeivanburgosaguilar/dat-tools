<script>
  // Test-only harness for DiffLayout.svelte.spec.js. DiffLayout's `panes` prop holds Svelte
  // snippets, which can only be declared inside a .svelte template - a plain .js test file can't
  // construct them, so this tiny wrapper stands in for what DiffChecker.svelte does for real.
  import DiffLayout from './DiffLayout.svelte';

  /**
   * @typedef {Object} DiffLayoutHarnessProps
   * @property {2 | 3} [paneCount]
   */

  /** @type {DiffLayoutHarnessProps} */
  let { paneCount = 2 } = $props();
</script>

{#snippet paneA()}
  <div data-testid="pane-a">Pane A</div>
{/snippet}
{#snippet paneB()}
  <div data-testid="pane-b">Pane B</div>
{/snippet}
{#snippet paneC()}
  <div data-testid="pane-c">Pane C</div>
{/snippet}

{#snippet primary()}
  <button data-testid="primary-btn">Primary</button>
{/snippet}
{#snippet actions()}
  <span data-testid="actions">Actions</span>
{/snippet}
{#snippet status()}
  <span data-testid="status">Status</span>
{/snippet}

<DiffLayout
  panes={paneCount === 3
    ? [
        { id: 'a', label: 'A', render: paneA },
        { id: 'b', label: 'B', render: paneB },
        { id: 'c', label: 'C', render: paneC }
      ]
    : [
        { id: 'a', label: 'A', render: paneA },
        { id: 'b', label: 'B', render: paneB }
      ]}
  {primary}
  {actions}
  {status}
/>
