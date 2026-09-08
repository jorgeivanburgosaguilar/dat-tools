<script>
  import { tick, untrack, onMount } from 'svelte';
  import { renderMarkdown } from '$lib/markdown-preview.js';
  import { createPopoutSync } from '$lib/popout-sync.js';
  import SplitView from '$lib/components/SplitView.svelte';
  import MarkdownEditorPane from '$lib/components/MarkdownEditorPane.svelte';
  import MarkdownRenderedPane from '$lib/components/MarkdownRenderedPane.svelte';
  import PopoutSatelliteBar from '$lib/components/PopoutSatelliteBar.svelte';
  import HtmlTableImportModal from '$lib/components/HtmlTableImportModal.svelte';
  import 'github-markdown-css/github-markdown.css';

  const TOOL = 'markdown-preview';

  /**
   * @typedef {Object} MarkdownPreviewProps
   * @property {string} [initialContent]
   * @property {(satellite: boolean, paneLabel?: string) => void} [onsatellite] - Fired once this
   *   window's role is known, so the route page can hide its "Back to Tools" header chrome in a
   *   satellite window and title the window/tab after the pane it's showing.
   */

  /** @type {MarkdownPreviewProps} */
  let { initialContent = '', onsatellite = () => {} } = $props();

  // Grouped into one $state object (rather than separate `let`s) so `applyPatch` from `popout.js`
  // can mutate it directly by key - see popout-sync.js's doc comment on why the sync layer owns no
  // state of its own. Both the owner and a satellite declare this with the same shape; a satellite
  // starts with defaults and gets the real values from the owner's handshake `state` reply.
  let shared = $state({
    markdown: untrack(() => initialContent),
    cursorLine: 1,
    lineHeightPx: 0
  });

  let charCount = $derived(shared.markdown.length);
  let wordCount = $derived(shared.markdown.trim() ? shared.markdown.trim().split(/\s+/).length : 0);
  let lineCount = $derived(shared.markdown ? shared.markdown.split('\n').length : 0);

  /** @type {'md' | 'html' | ''} */
  let copied = $state('');

  // Tracks the caret so "Import HTML Table" can insert at the right spot; defaults to the end of
  // the document so inserting before ever focusing the textarea appends. Deliberately NOT part of
  // `shared` - it's local UI bookkeeping for the editor pane's own window, not synced state.
  let caret = $state(untrack(() => initialContent).length);

  let showTableImport = $state(false);

  /** @type {{ focusAt: (position: number) => void } | null} */
  let editorPaneRef = $state(null);

  // --- Pop-out sync -----------------------------------------------------------------------------

  /** @type {ReturnType<typeof createPopoutSync> | null} */
  let sync = null;
  let syncReady = $state(false);
  // Set from `sync.isSatelliteRequest` as soon as `sync` exists - unlike `isSatellite` below, this
  // doesn't wait for the owner's handshake reply, and it's what `hostsEditor` needs: while a
  // satellite's handshake is still pending, `isSatellite` is still false, and falling through to
  // the owner's `!poppedIds.includes('editor')` check would read `poppedIds` = [] (never populated
  // on a satellite) and wrongly evaluate to true, causing the satellite to broadcast its own
  // still-empty `shared` back out before the real snapshot ever arrives.
  let isSatelliteRequest = $state(false);

  /** Owner only: pane ids ('editor' | 'preview') currently confirmed popped out. */
  let poppedIds = $state(/** @type {string[]} */ ([]));
  /** Whether the owner's handshake reply has arrived and this window is showing just one pane. */
  let isSatellite = $state(false);
  /** Satellite only: which pane this window is showing. */
  let satellitePaneId = $state(/** @type {'editor' | 'preview' | null} */ (null));
  /** Satellite only: whether the owner window is currently reachable. */
  let connected = $state(false);
  let popoutBlockedHint = $state(false);

  // Whichever window currently renders MarkdownEditorPane is the write-authoritative side for all
  // of `shared` - the display-only side never calls sync.send(...). See MarkdownEditorPane.svelte's
  // doc comment.
  let hostsEditor = $derived(
    isSatelliteRequest ? isSatellite && satellitePaneId === 'editor' : !poppedIds.includes('editor')
  );

  let splitPoppedId = $derived(
    /** @type {'first' | 'second' | null} */ (
      poppedIds.includes('editor') ? 'first' : poppedIds.includes('preview') ? 'second' : null
    )
  );

  $effect(() => {
    if (!syncReady || !hostsEditor) return;
    sync?.send({
      markdown: shared.markdown,
      cursorLine: shared.cursorLine,
      lineHeightPx: shared.lineHeightPx
    });
  });

  onMount(() => {
    sync = createPopoutSync({
      tool: TOOL,
      shared,
      callbacks: {
        onSatelliteReady: (paneId) => {
          isSatellite = true;
          satellitePaneId = /** @type {'editor' | 'preview'} */ (paneId);
          onsatellite(true, paneId === 'editor' ? 'Markdown' : 'Preview');
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

  function clear() {
    if (!hostsEditor) return;
    shared.markdown = '';
  }

  async function copyMarkdown() {
    await navigator.clipboard.writeText(shared.markdown);
    copied = 'md';
    setTimeout(() => (copied = ''), 1500);
  }

  async function copyHtml() {
    await navigator.clipboard.writeText(renderMarkdown(shared.markdown));
    copied = 'html';
    setTimeout(() => (copied = ''), 1500);
  }

  /**
   * Splices `text` into the document at the last known caret position, adding surrounding
   * blank lines only where one isn't already present (a GFM table needs a blank line before
   * it to be recognized), then moves the caret to the end of the inserted block. Only reachable
   * while this window hosts the editor pane (see the `hostsEditor` guard on the toolbar button).
   * @param {string} text
   */
  async function insertAtCursor(text) {
    const before = shared.markdown.slice(0, caret);
    const after = shared.markdown.slice(caret);

    const leadingGap =
      before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    const trailingGap =
      after === '' || after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';

    const insertion = leadingGap + text + trailingGap;
    const insertEnd = before.length + insertion.length;

    shared.markdown = before + insertion + after;
    showTableImport = false;

    await tick();
    editorPaneRef?.focusAt(insertEnd);
    caret = insertEnd;
  }
</script>

{#snippet actions()}
  {#if popoutBlockedHint}
    <span class="text-xs text-red-500 dark:text-red-400">Pop-up blocked by the browser</span>
  {/if}
  <button
    onclick={() => (showTableImport = true)}
    disabled={!hostsEditor}
    class="rounded px-2 py-1 text-xs font-medium transition-colors {hostsEditor
      ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100'
      : 'cursor-not-allowed text-gray-300 dark:text-gray-600'}"
  >
    Import HTML Table
  </button>
  <button
    onclick={clear}
    disabled={!hostsEditor}
    class="rounded px-2 py-1 text-xs font-medium transition-colors {hostsEditor
      ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100'
      : 'cursor-not-allowed text-gray-300 dark:text-gray-600'}"
  >
    Clear
  </button>
  <button
    onclick={copyMarkdown}
    class="rounded px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
  >
    {copied === 'md' ? '✓ Copied' : 'Copy MD'}
  </button>
  <button
    onclick={copyHtml}
    class="rounded px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
  >
    {copied === 'html' ? '✓ Copied' : 'Copy HTML'}
  </button>
{/snippet}

{#if isSatellite}
  <div class="flex h-full flex-col">
    <PopoutSatelliteBar
      label={satellitePaneId === 'editor' ? 'Markdown' : 'Preview'}
      {connected}
      {actions}
      onreturn={() => sync?.returnHome()}
    />
    {#if satellitePaneId === 'editor'}
      <MarkdownEditorPane
        bind:this={editorPaneRef}
        bind:value={shared.markdown}
        oncursor={({ cursorLine, caret: newCaret }) => {
          shared.cursorLine = cursorLine;
          caret = newCaret;
        }}
        onlineheight={(px) => (shared.lineHeightPx = px)}
      />
    {:else}
      <MarkdownRenderedPane
        markdown={shared.markdown}
        cursorLine={shared.cursorLine}
        lineHeightPx={shared.lineHeightPx}
      />
    {/if}
  </div>
{:else}
  <SplitView poppedId={splitPoppedId} firstLabel="Markdown" secondLabel="Preview" {actions}>
    {#snippet first()}
      <MarkdownEditorPane
        bind:this={editorPaneRef}
        bind:value={shared.markdown}
        oncursor={({ cursorLine, caret: newCaret }) => {
          shared.cursorLine = cursorLine;
          caret = newCaret;
        }}
        onlineheight={(px) => (shared.lineHeightPx = px)}
        onpopout={poppedIds.length === 0 ? () => sync?.requestPopout('editor') : undefined}
      />
    {/snippet}

    {#snippet second()}
      <MarkdownRenderedPane
        markdown={shared.markdown}
        cursorLine={shared.cursorLine}
        lineHeightPx={shared.lineHeightPx}
        onpopout={poppedIds.length === 0 ? () => sync?.requestPopout('preview') : undefined}
      />
    {/snippet}

    {#snippet status()}
      {wordCount} words · {lineCount} lines · {charCount} characters
    {/snippet}
  </SplitView>
{/if}

<!-- Rendered regardless of branch: `showTableImport` is local, per-window UI state (not part of
     `shared`), so it can only ever be set true from this same window's own "Import HTML Table"
     button - which is itself disabled unless this window hosts the editor pane. -->
<HtmlTableImportModal
  open={showTableImport}
  oninsert={insertAtCursor}
  onclose={() => (showTableImport = false)}
/>
