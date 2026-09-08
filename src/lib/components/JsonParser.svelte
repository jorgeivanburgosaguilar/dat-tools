<script>
  import { untrack, onMount } from 'svelte';
  import { parseJson, countJsonStats, DEFAULT_CONTENT } from '$lib/json-parser.js';
  import { loadWrapPreference, saveWrapPreference } from '$lib/wrap-preference.js';
  import { createPopoutSync } from '$lib/popout-sync.js';
  import SplitView from '$lib/components/SplitView.svelte';
  import CodeEditorPane from '$lib/components/CodeEditorPane.svelte';
  import JsonOutputPane from '$lib/components/JsonOutputPane.svelte';
  import PopoutButton from '$lib/components/PopoutButton.svelte';
  import PopoutSatelliteBar from '$lib/components/PopoutSatelliteBar.svelte';

  const TOOL = 'json-validator';

  /**
   * @typedef {Object} JsonParserProps
   * @property {string} [initialContent]
   * @property {(satellite: boolean, paneLabel?: string) => void} [onsatellite] - Fired once this
   *   window's role is known, so the route page can hide its "Back to Tools" header chrome in a
   *   satellite window and title the window/tab after the pane it's showing.
   */

  /** @type {JsonParserProps} */
  let { initialContent = '', onsatellite = () => {} } = $props();

  // Grouped into one $state object (rather than separate `let`s) so `applyPatch` from `popout.js`
  // can mutate it directly by key - see popout-sync.js's doc comment on why the sync layer owns no
  // state of its own. Both the owner and a satellite declare this with the same shape; a satellite
  // starts with defaults and gets the real values from the owner's handshake `state` reply.
  let shared = $state({
    input: untrack(() => initialContent),
    wrap: untrack(() => loadWrapPreference('json-validator'))
  });

  let copied = $state(false);

  // Pure functions of shared.input - recomputed independently in every window (owner or either
  // satellite), since `shared.input` itself is kept in sync everywhere regardless of which pane a
  // given window is displaying (applyPatch matches by key, not by pane).
  let parseResult = $derived(parseJson(shared.input));
  let stats = $derived(countJsonStats(shared.input));

  // --- Pop-out sync -----------------------------------------------------------------------------

  /** @type {ReturnType<typeof createPopoutSync> | null} */
  let sync = null;
  let syncReady = $state(false);
  // Set from `sync.isSatelliteRequest` as soon as `sync` exists - see popout-sync.js's doc comment
  // on why ownership checks must gate on this, not merely on `isSatellite`.
  let isSatelliteRequest = $state(false);

  /** Owner only: pane ids ('input' | 'output') currently confirmed popped out. */
  let poppedIds = $state(/** @type {string[]} */ ([]));
  /** Whether the owner's handshake reply has arrived and this window is showing just one pane. */
  let isSatellite = $state(false);
  /** Satellite only: which pane this window is showing. */
  let satellitePaneId = $state(/** @type {'input' | 'output' | null} */ (null));
  /** Satellite only: whether the owner window is currently reachable. */
  let connected = $state(false);
  let popoutBlockedHint = $state(false);

  /** Whether this window is allowed to broadcast at all - see popout-sync.js's doc comment: a
   * satellite must send nothing until its handshake snapshot has actually arrived, or it broadcasts
   * its still-default `shared` and clobbers the real value moments before it arrives. */
  let canSend = $derived(syncReady && (isSatelliteRequest ? isSatellite : true));

  /** @param {string} id */
  function hostsPane(id) {
    return isSatelliteRequest ? isSatellite && satellitePaneId === id : !poppedIds.includes(id);
  }

  let hostsInput = $derived(hostsPane('input'));
  let canFormat = $derived(hostsInput && parseResult.success);

  let splitPoppedId = $derived(
    /** @type {'first' | 'second' | null} */ (
      poppedIds.includes('input') ? 'first' : poppedIds.includes('output') ? 'second' : null
    )
  );

  $effect(() => {
    if (!canSend || !hostsInput) return;
    sync?.send({ input: shared.input, wrap: shared.wrap });
  });

  $effect(() => {
    if (!hostsInput) return;
    saveWrapPreference('json-validator', shared.wrap);
  });

  onMount(() => {
    sync = createPopoutSync({
      tool: TOOL,
      shared,
      callbacks: {
        onSatelliteReady: (paneId) => {
          isSatellite = true;
          satellitePaneId = /** @type {'input' | 'output'} */ (paneId);
          onsatellite(true, paneId === 'input' ? 'Input' : 'Output');
        },
        onConnectionChange: (value) => {
          connected = value;
        },
        onOwnerPoppedChange: (ids) => {
          poppedIds = ids;
        },
        onPopoutBlocked: () => {
          popoutBlockedHint = true;
          setTimeout(() => (popoutBlockedHint = false), 4000);
        }
      }
    });
    isSatelliteRequest = sync.isSatelliteRequest;
    syncReady = true;

    return () => {
      sync?.destroy();
    };
  });

  function loadSample() {
    if (!hostsInput) return;
    shared.input = DEFAULT_CONTENT;
  }

  function formatJson() {
    if (!hostsInput || !parseResult.success) return;
    shared.input = parseResult.formatted;
  }

  function minifyJson() {
    if (!hostsInput || !parseResult.success) return;
    shared.input = parseResult.minified;
  }

  function clear() {
    if (!hostsInput) return;
    shared.input = '';
  }

  async function copyInput() {
    if (!shared.input) return;
    await navigator.clipboard.writeText(shared.input);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }
</script>

{#snippet validityBadge()}
  {#if shared.input.trim()}
    <span class="flex items-center gap-1 text-xs font-medium">
      {#if parseResult.success}
        <span class="inline-block h-2 w-2 rounded-full bg-green-500"></span>
        <span class="text-green-600 dark:text-green-400">Valid</span>
      {:else}
        <span class="inline-block h-2 w-2 rounded-full bg-red-500"></span>
        <span class="text-red-600 dark:text-red-400">Invalid</span>
      {/if}
    </span>
  {/if}
{/snippet}

{#snippet actions()}
  {#if popoutBlockedHint}
    <span class="text-xs text-red-500 dark:text-red-400">Pop-up blocked by the browser</span>
  {/if}
  <button
    onclick={formatJson}
    disabled={!canFormat}
    class="rounded px-2 py-1 text-xs font-medium transition-colors {canFormat
      ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100'
      : 'cursor-not-allowed text-gray-300 dark:text-gray-600'}"
  >
    Format
  </button>
  <button
    onclick={minifyJson}
    disabled={!canFormat}
    class="rounded px-2 py-1 text-xs font-medium transition-colors {canFormat
      ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100'
      : 'cursor-not-allowed text-gray-300 dark:text-gray-600'}"
  >
    Minify
  </button>
  <button
    onclick={copyInput}
    disabled={!shared.input}
    class="rounded px-2 py-1 text-xs font-medium transition-colors {shared.input
      ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100'
      : 'cursor-not-allowed text-gray-300 dark:text-gray-600'}"
  >
    {copied ? '✓ Copied' : 'Copy'}
  </button>
  <button
    onclick={loadSample}
    disabled={!hostsInput}
    class="rounded px-2 py-1 text-xs font-medium transition-colors {hostsInput
      ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100'
      : 'cursor-not-allowed text-gray-300 dark:text-gray-600'}"
  >
    Sample
  </button>
  <button
    onclick={clear}
    disabled={!hostsInput}
    class="rounded px-2 py-1 text-xs font-medium transition-colors {hostsInput
      ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100'
      : 'cursor-not-allowed text-gray-300 dark:text-gray-600'}"
  >
    Clear
  </button>
{/snippet}

{#if isSatellite}
  <div class="flex h-full flex-col">
    <PopoutSatelliteBar
      label={satellitePaneId === 'input' ? 'Input' : 'Output'}
      {connected}
      {actions}
      onreturn={() => sync?.returnHome()}
    />
    {#if satellitePaneId === 'input'}
      <CodeEditorPane
        label="Input"
        bind:value={shared.input}
        bind:wrap={shared.wrap}
        placeholder="Paste your JSON here..."
      >
        {#snippet headerExtra()}
          {@render validityBadge()}
        {/snippet}
      </CodeEditorPane>
    {:else}
      <JsonOutputPane {parseResult} hasInput={!!shared.input.trim()} />
    {/if}
  </div>
{:else}
  <SplitView poppedId={splitPoppedId} firstLabel="Input" secondLabel="Output" {actions}>
    {#snippet first()}
      <CodeEditorPane
        label="Input"
        bind:value={shared.input}
        bind:wrap={shared.wrap}
        placeholder="Paste your JSON here..."
      >
        {#snippet headerExtra()}
          {@render validityBadge()}
          {#if poppedIds.length === 0}
            <PopoutButton label="Input" onclick={() => sync?.requestPopout('input')} />
          {/if}
        {/snippet}
      </CodeEditorPane>
    {/snippet}

    {#snippet second()}
      <JsonOutputPane
        {parseResult}
        hasInput={!!shared.input.trim()}
        onpopout={poppedIds.length === 0 ? () => sync?.requestPopout('output') : undefined}
      />
    {/snippet}

    {#snippet status()}
      {stats.lines} lines · {stats.chars} characters
    {/snippet}
  </SplitView>
{/if}
