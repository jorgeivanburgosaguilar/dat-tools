<script>
  /**
   * @typedef {Object} CodeEditorPaneProps
   * @property {string} label - Pane header label (e.g. "Original", "Changed").
   * @property {string} [value] - Two-way bound editor content.
   * @property {string} [placeholder]
   */

  /** @type {CodeEditorPaneProps} */
  let { label, value = $bindable(''), placeholder = 'Paste text here...' } = $props();

  /** @type {HTMLTextAreaElement | null} */
  let textareaEl = $state(null);
  /** @type {HTMLDivElement | null} */
  let gutterEl = $state(null);

  let focused = $state(false);
  let cursorLine = $state(1);
  let cursorCol = $state(1);

  let lineCount = $derived(value === '' ? 1 : value.split('\n').length);
  let lineNumbers = $derived(Array.from({ length: lineCount }, (_, i) => i + 1));

  function syncGutter() {
    if (gutterEl && textareaEl) gutterEl.scrollTop = textareaEl.scrollTop;
  }

  function updateCursor() {
    if (!textareaEl) return;
    const pos = textareaEl.selectionStart;
    const before = value.slice(0, pos);
    cursorLine = (before.match(/\n/g) ?? []).length + 1;
    cursorCol = pos - before.lastIndexOf('\n');
  }
</script>

<div
  class="flex items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-gray-700"
>
  <span class="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400"
    >{label}</span
  >
  {#if focused}
    <span class="inline-flex items-center text-xs text-gray-400 dark:text-gray-500"
      >Ln {cursorLine}, Col {cursorCol}</span
    >
  {/if}
</div>
<div class="flex min-h-0 flex-1 overflow-hidden bg-white dark:bg-gray-900">
  <!-- gutter -->
  <div
    bind:this={gutterEl}
    aria-hidden="true"
    class="overflow-hidden py-4 pr-2 pl-3 font-mono text-sm leading-5 text-gray-400 select-none dark:text-gray-500"
  >
    {#each lineNumbers as lineNum (lineNum)}
      <div class="text-right">{lineNum}</div>
    {/each}
  </div>
  <!-- editor -->
  <textarea
    bind:this={textareaEl}
    bind:value
    onscroll={syncGutter}
    onfocus={() => {
      focused = true;
      updateCursor();
    }}
    onblur={() => {
      focused = false;
    }}
    onkeyup={updateCursor}
    onclick={updateCursor}
    spellcheck="false"
    class="flex-1 resize-none bg-transparent py-4 pr-4 font-mono text-sm leading-5 text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-gray-500"
    {placeholder}></textarea>
</div>
