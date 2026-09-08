<script>
  import { resolve } from '$app/paths';
  import AgentTrajectoryViewer from '$lib/components/AgentTrajectoryViewer.svelte';

  // Starts false so the very first client render matches the prerendered HTML (the URL's
  // `?popout=` isn't consulted here at all - see AgentTrajectoryViewer.svelte / popout-sync.js).
  // Flipped by the tool component once it's actually confirmed satellite mode via a completed
  // handshake.
  let satellite = $state(false);
  let paneLabel = $state('');
</script>

<svelte:head>
  <title>{satellite ? paneLabel : 'Agent Trajectory Viewer'}</title>
</svelte:head>

<main class="flex h-screen flex-col overflow-hidden bg-white dark:bg-gray-900">
  {#if !satellite}
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
        Agent Trajectory Viewer
      </h1>
      <span class="ml-auto font-mono text-xs text-gray-400 dark:text-gray-500">
        {__APP_VERSION__}
      </span>
    </div>
  {/if}

  <div class="min-h-0 flex-1">
    <AgentTrajectoryViewer
      onsatellite={(v, label) => {
        satellite = v;
        paneLabel = label ?? '';
      }}
    />
  </div>
</main>
