<script>
  import { resolve } from '$app/paths';
  import WordCounter from '$lib/components/WordCounter.svelte';
  import favicon from '$lib/assets/favicon-word-counter.svg';
</script>

<svelte:head>
  <title>Word Counter</title>
  <link rel="icon" href={favicon} />
</svelte:head>

<main class="flex min-h-screen flex-col items-center justify-center bg-white p-4 dark:bg-gray-900">
  <div class="w-full max-w-3xl">
    <div class="mb-8 text-center">
      <a
        href={resolve('/')}
        class="mb-4 inline-block text-sm text-gray-500 transition-colors hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
      >
        &larr; Back to Tools
      </a>
      <h1 class="font-mono text-4xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
        Word Counter
      </h1>
    </div>

    <WordCounter />

    <div class="p-6 text-center">
      <h4 class="font-mono font-bold tracking-tight text-gray-900 tabular-nums dark:text-gray-100">
        Version {__APP_VERSION__}
      </h4>
    </div>
  </div>
</main>
