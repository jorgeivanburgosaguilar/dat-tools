<script>
  // Test-only harness for SplitView.svelte.spec.js. SplitView's `first`/`second`/`actions`/`status`
  // props hold Svelte snippets, which can only be declared inside a .svelte template - a plain .js
  // test file can't construct them, so this tiny wrapper stands in for what a real tool component
  // (MarkdownPreview, JsonParser) does. Mirrors DiffLayoutHarness.svelte's approach.
  import SplitView from './SplitView.svelte';

  /**
   * @typedef {Object} SplitViewHarnessProps
   * @property {'first' | 'second' | null} [poppedId]
   */

  /** @type {SplitViewHarnessProps} */
  let { poppedId = null } = $props();
</script>

{#snippet first()}
  <div data-testid="pane-first">First pane</div>
{/snippet}
{#snippet second()}
  <div data-testid="pane-second">Second pane</div>
{/snippet}
{#snippet actions()}
  <span data-testid="actions">Actions</span>
{/snippet}
{#snippet status()}
  <span data-testid="status">Status</span>
{/snippet}

<SplitView
  {first}
  {second}
  {actions}
  {status}
  {poppedId}
  firstLabel="Editor"
  secondLabel="Preview"
/>
