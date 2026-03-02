<script>
  import JsonNode from './JsonNode.svelte';

  /**
   * @typedef {{ value: any, depth?: number, isLast?: boolean, keyName?: string|null }} JsonNodeProps
   */
  /** @type {JsonNodeProps} */
  let { value, depth = 0, isLast = true, keyName = null } = $props();

  let collapsed = $state(false);

  const nodeType = $derived(
    Array.isArray(value)
      ? 'array'
      : value !== null && typeof value === 'object'
        ? 'object'
        : 'primitive'
  );
  const objectEntries = $derived(nodeType === 'object' ? Object.entries(value) : []);
  const arrayItems = $derived(nodeType === 'array' ? value : []);
  const childCount = $derived(
    nodeType === 'object' ? objectEntries.length : nodeType === 'array' ? arrayItems.length : 0
  );
  const openBracket = $derived(nodeType === 'array' ? '[' : '{');
  const closeBracket = $derived(nodeType === 'array' ? ']' : '}');
  const bracketClass = $derived(nodeType === 'array' ? 'json-bracket' : 'json-brace');
  const indentStyle = $derived(`padding-left: ${depth * 2}ch`);
  const primitive = $derived(
    value === null
      ? { cls: 'json-null', text: 'null' }
      : typeof value === 'boolean'
        ? { cls: 'json-boolean', text: String(value) }
        : typeof value === 'number'
          ? { cls: 'json-number', text: String(value) }
          : { cls: 'json-string', text: JSON.stringify(value) }
  );

  function toggle() {
    collapsed = !collapsed;
  }
</script>

{#if nodeType === 'primitive'}
  <div class="flex items-start font-mono text-sm leading-5" style={indentStyle}>
    <span class="inline-block w-4 shrink-0"></span>
    {#if keyName !== null}
      <span class="json-key mr-1">"{keyName}": </span>
    {/if}
    <span class={primitive.cls}>{primitive.text}</span>
    {#if !isLast}
      <span class="text-gray-400">,</span>
    {/if}
  </div>
{:else if childCount === 0}
  <div class="flex items-start font-mono text-sm leading-5" style={indentStyle}>
    <span class="inline-block w-4 shrink-0"></span>
    {#if keyName !== null}
      <span class="json-key mr-1">"{keyName}": </span>
    {/if}
    <span class={bracketClass}>{openBracket}{closeBracket}</span>
    {#if !isLast}
      <span class="text-gray-400">,</span>
    {/if}
  </div>
{:else if collapsed}
  <div class="flex items-start font-mono text-sm leading-5" style={indentStyle}>
    <button
      onclick={toggle}
      class="w-4 shrink-0 cursor-pointer text-xs leading-5 text-gray-500 select-none hover:text-gray-700 dark:hover:text-gray-200"
      aria-label="Expand">▶</button
    >
    {#if keyName !== null}
      <span class="json-key mr-1">"{keyName}": </span>
    {/if}
    <span class={bracketClass}>{openBracket}</span><span class="ml-1 text-xs text-gray-400"
      >...</span
    ><span class={bracketClass}>{closeBracket}</span><span class="ml-2 text-xs text-gray-500"
      >// {childCount} items</span
    >
    {#if !isLast}
      <span class="text-gray-400">,</span>
    {/if}
  </div>
{:else}
  <div class="flex items-start font-mono text-sm leading-5" style={indentStyle}>
    <button
      onclick={toggle}
      class="w-4 shrink-0 cursor-pointer text-xs leading-5 text-gray-500 select-none hover:text-gray-700 dark:hover:text-gray-200"
      aria-label="Collapse">▼</button
    >
    {#if keyName !== null}
      <span class="json-key mr-1">"{keyName}": </span>
    {/if}
    <span class={bracketClass}>{openBracket}</span>
  </div>
  {#if nodeType === 'object'}
    {#each objectEntries as [k, v], i (k)}
      <JsonNode value={v} depth={depth + 1} isLast={i === objectEntries.length - 1} keyName={k} />
    {/each}
  {:else}
    {#each arrayItems as item, i (i)}
      <JsonNode
        value={item}
        depth={depth + 1}
        isLast={i === arrayItems.length - 1}
        keyName={null}
      />
    {/each}
  {/if}
  <div class="flex items-start font-mono text-sm leading-5" style={indentStyle}>
    <span class="inline-block w-4 shrink-0"></span>
    <span class={bracketClass}>{closeBracket}</span>
    {#if !isLast}
      <span class="text-gray-400">,</span>
    {/if}
  </div>
{/if}
