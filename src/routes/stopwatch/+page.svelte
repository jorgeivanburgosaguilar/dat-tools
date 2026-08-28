<script>
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { formatTime } from '$lib/stopwatch-utils';
  import Stopwatch from '$lib/components/Stopwatch.svelte';
  import favicon from '$lib/assets/favicon-stopwatch.svg';

  let originalTitle = $state('');

  onMount(() => {
    originalTitle = document.title;
  });

  /**
   * Handle stopwatch start - update title immediately
   * @param {{ elapsedTime: number }} detail
   */
  function handleStopwatchStart(detail) {
    const { elapsedTime } = detail;
    if (typeof document !== 'undefined') {
      document.title = formatTime(elapsedTime);
    }
  }

  /**
   * Handle stopwatch pause - update title with paused time
   * @param {{ elapsedTime: number }} detail
   */
  function handleStopwatchPause(detail) {
    const { elapsedTime } = detail;
    if (typeof document !== 'undefined') {
      document.title = formatTime(elapsedTime);
    }
  }

  /**
   * Handle stopwatch tick - update title every 5 seconds
   * @param {{ elapsedTime: number }} detail
   */
  function handleStopwatchTick(detail) {
    const { elapsedTime } = detail;
    if (typeof document !== 'undefined') {
      document.title = formatTime(elapsedTime);
    }
  }

  /**
   * Handle stopwatch stop - reset title to original
   */
  function handleStopwatchStop() {
    if (originalTitle) {
      document.title = originalTitle;
    }
  }
</script>

<svelte:head>
  <title>Stopwatch</title>
  <link rel="icon" href={favicon} />
</svelte:head>

<main class="flex min-h-screen flex-col items-center justify-center bg-white p-4 dark:bg-gray-900">
  <div class="w-full max-w-5xl">
    <div class="mb-8 text-center">
      <a
        href={resolve('/')}
        class="mb-4 inline-block text-sm text-gray-500 transition-colors hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
      >
        &larr; Back to Tools
      </a>
      <h1 class="font-mono text-4xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
        Stopwatch
      </h1>
    </div>

    <!-- Stopwatch Component -->
    <Stopwatch
      onstart={handleStopwatchStart}
      onpause={handleStopwatchPause}
      onstop={handleStopwatchStop}
      ontick={handleStopwatchTick}
    />

    <div class="p-6 text-center">
      <h4 class="font-mono font-bold tracking-tight text-gray-900 tabular-nums dark:text-gray-100">
        Version {__APP_VERSION__}
      </h4>
    </div>
  </div>
</main>
