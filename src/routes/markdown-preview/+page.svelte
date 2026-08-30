<script>
  import { resolve, asset } from '$app/paths';
  import MarkdownPreview from '$lib/components/MarkdownPreview.svelte';
  import { DEFAULT_CONTENT } from '$lib/markdown-preview.js';
</script>

<svelte:head>
  <title>Markdown Preview</title>
  <link rel="icon" href={asset('/favicon-markdown-preview.svg')} type="image/svg+xml" />
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
      Markdown Preview
    </h1>
    <span class="ml-auto font-mono text-xs text-gray-400 dark:text-gray-500">
      {__APP_VERSION__}
    </span>
  </div>

  <div class="min-h-0 flex-1">
    <MarkdownPreview initialContent={DEFAULT_CONTENT} />
  </div>
</main>
