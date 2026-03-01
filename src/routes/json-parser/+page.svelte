<script>
  import { resolve } from '$app/paths';
  import JsonParser from '$lib/components/JsonParser.svelte';
  import { DEFAULT_CONTENT } from '$lib/json-parser.js';
</script>

<svelte:head>
  <title>JSON Parser</title>
</svelte:head>

<main class="flex h-screen flex-col overflow-hidden bg-white dark:bg-gray-900">
  <div
    class="flex shrink-0 items-center gap-4 border-b border-gray-200 px-4 py-3 dark:border-gray-700"
  >
    <a
      href={resolve('/')}
      class="text-sm text-gray-500 transition-colors hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
    >
      &larr; Back to Tools
    </a>
    <h1 class="font-mono text-lg font-bold tracking-tight text-gray-900 dark:text-gray-100">
      JSON Parser
    </h1>
    <span class="ml-auto font-mono text-xs text-gray-400 dark:text-gray-500">
      {__APP_VERSION__}
    </span>
  </div>

  <div class="min-h-0 flex-1">
    <JsonParser initialContent={DEFAULT_CONTENT} />
  </div>
</main>
