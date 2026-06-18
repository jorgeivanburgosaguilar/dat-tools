<script>
  /**
   * Stopwatch Component
   * Handles start, pause, continue, and stop functionality independently
   * Manages session records via IndexedDB
   * Uses callback props for parent communication (Svelte 5 pattern)
   */

  import { onMount, untrack } from 'svelte';
  import { initDB, saveRecord, getAllRecords, clearAllRecords } from '$lib/stopwatch-db';
  import { formatTime, formatDate, formatTimeOnly, formatElapsed } from '$lib/stopwatch-utils';

  /**
   * @typedef {Object} StopwatchStartDetail
   * @property {number} elapsedTime - Elapsed time in milliseconds
   */

  /**
   * @typedef {Object} StopwatchPauseDetail
   * @property {number} elapsedTime - Elapsed time in milliseconds
   */

  /**
   * @typedef {Object} StopwatchStopDetail
   * @property {number} elapsedTime - Elapsed time in milliseconds
   * @property {number} sessionStartTime - Session start timestamp
   * @property {number} endTimestamp - Session end timestamp
   */

  /**
   * @typedef {Object} StopwatchTickDetail
   * @property {number} elapsedTime - Elapsed time in milliseconds
   */

  /**
   * @typedef {Object} Lap
   * @property {number} id - Sequential lap number
   * @property {number} startTimestamp - Wall-clock start of the lap segment
   * @property {number} endTimestamp - Wall-clock end of the lap segment
   * @property {number} elapsedMinutes - Lap duration in whole minutes
   */

  /**
   * @type {{
   *   onstart?: (detail: StopwatchStartDetail) => void,
   *   onpause?: (detail: StopwatchPauseDetail) => void,
   *   onstop?: (detail: StopwatchStopDetail) => void | Promise<void>,
   *   ontick?: (detail: StopwatchTickDetail) => void
   * }}
   */
  let { onstart = () => {}, onpause = () => {}, onstop = () => {}, ontick = () => {} } = $props();

  let isRunning = $state(false);
  let isPaused = $state(false);
  let elapsedTime = $state(0);
  let startTime = $state(0);
  let sessionStartTime = $state(0);
  /** @type {any[]} */
  let records = $state([]);
  let showClearModal = $state(false);

  /** @type {Lap[]} */
  let laps = $state([]);
  let lastLapElapsed = $state(0);
  let lastLapTimestamp = $state(0);

  $effect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      untrack(() => {
        elapsedTime = Date.now() - startTime;
        const totalSeconds = Math.floor(elapsedTime / 1000);
        if (totalSeconds > 0 && totalSeconds % 5 === 0) {
          ontick({ elapsedTime });
        }
      });
    }, 1000);

    return () => clearInterval(interval);
  });

  onMount(async () => {
    await initDB();
    await loadRecords();
  });

  async function loadRecords() {
    records = await getAllRecords();
  }

  /**
   * Start or continue the stopwatch
   */
  function start() {
    if (!isRunning) {
      if (!isPaused) {
        laps = [];
        lastLapElapsed = 0;
        lastLapTimestamp = 0;
      }

      if (!isPaused && elapsedTime > 0) {
        elapsedTime = 0;
        startTime = 0;
        sessionStartTime = Date.now();
      } else if (elapsedTime === 0) {
        sessionStartTime = Date.now();
      }

      startTime = Date.now() - elapsedTime;
      isRunning = true;
      isPaused = false;

      onstart({ elapsedTime });
    }
  }

  /**
   * Pause the stopwatch
   */
  function pause() {
    if (isRunning) {
      isRunning = false;
      isPaused = true;

      onpause({ elapsedTime });
    }
  }

  /**
   * Record a lap: the elapsed time since the previous lap (or session start
   * for the first lap). Splits are kept in memory only.
   */
  function lap() {
    if (!isRunning) return;

    const now = Date.now();
    const splitMs = elapsedTime - lastLapElapsed;
    laps = [
      {
        id: laps.length + 1,
        startTimestamp: lastLapTimestamp || sessionStartTime,
        endTimestamp: now,
        elapsedMinutes: Math.floor(splitMs / 60000)
      },
      ...laps
    ];

    lastLapElapsed = elapsedTime;
    lastLapTimestamp = now;
  }

  /**
   * Stop the stopwatch, call parent callback, and save session record
   */
  async function stop() {
    isRunning = false;
    isPaused = false;

    const endTimestamp = Date.now();

    if (laps.length > 0 && elapsedTime > lastLapElapsed) {
      const splitMs = elapsedTime - lastLapElapsed;
      laps = [
        {
          id: laps.length + 1,
          startTimestamp: lastLapTimestamp || sessionStartTime,
          endTimestamp,
          elapsedMinutes: Math.floor(splitMs / 60000)
        },
        ...laps
      ];
    }

    if (elapsedTime > 0 && sessionStartTime > 0) {
      onstop({ elapsedTime, sessionStartTime, endTimestamp });

      const isDuplicate = records.length > 0 && records[0].startTimestamp === sessionStartTime;
      if (!isDuplicate) {
        await saveRecord(sessionStartTime, endTimestamp, elapsedTime);
        await loadRecords();
      }
    }

    sessionStartTime = 0;
  }

  async function handleClearRecords() {
    await clearAllRecords();
    await loadRecords();
  }

  function handleClearClick() {
    showClearModal = true;
  }

  function cancelClear() {
    showClearModal = false;
  }

  async function confirmClear() {
    await handleClearRecords();
    showClearModal = false;
  }
</script>

<!-- Time Display - Centered and Huge -->
<div class="mb-12 text-center">
  <h1
    class="font-mono text-8xl font-bold tracking-tight text-gray-900 tabular-nums md:text-9xl dark:text-gray-100"
  >
    {formatTime(elapsedTime)}
  </h1>
</div>

<!-- Controls - Large Buttons -->
<div class="mb-12 flex flex-col gap-4 md:flex-row md:justify-center">
  {#if !isRunning && !isPaused}
    <button
      onclick={start}
      class="rounded-lg bg-green-600 px-16 py-8 text-3xl font-bold text-white transition-colors hover:bg-green-700 active:bg-green-800 md:text-4xl"
    >
      Start
    </button>
  {:else if isRunning}
    <button
      onclick={pause}
      class="rounded-lg bg-yellow-600 px-16 py-8 text-3xl font-bold text-white transition-colors hover:bg-yellow-700 active:bg-yellow-800 md:text-4xl"
    >
      Pause
    </button>
    <button
      onclick={lap}
      class="rounded-lg bg-blue-600 px-16 py-8 text-3xl font-bold text-white transition-colors hover:bg-blue-700 active:bg-blue-800 md:text-4xl"
    >
      Lap
    </button>
  {:else if isPaused}
    <button
      onclick={start}
      class="rounded-lg bg-green-600 px-16 py-8 text-3xl font-bold text-white transition-colors hover:bg-green-700 active:bg-green-800 md:text-4xl"
    >
      Continue
    </button>
  {/if}

  <button
    onclick={stop}
    class="rounded-lg bg-red-600 px-16 py-8 text-3xl font-bold text-white transition-colors hover:bg-red-700 active:bg-red-800 md:text-4xl"
  >
    Stop
  </button>
</div>

<!-- Laps Section (in-memory only, cleared on a fresh start) -->
{#if laps.length > 0}
  <div
    class="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800"
  >
    <div class="mb-4">
      <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100">Laps</h2>
    </div>

    <div class="max-h-96 space-y-3 overflow-y-auto">
      {#each laps as lap (lap.id)}
        <div
          class="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
        >
          <div class="font-mono text-sm text-gray-700 dark:text-gray-300">
            📅 {formatDate(lap.startTimestamp)} ⏱ {formatTimeOnly(
              lap.startTimestamp
            )}-{formatTimeOnly(lap.endTimestamp)} ⏳ Lap {lap.id}:
            <span class="text-blue-600 dark:text-blue-400">{formatElapsed(lap.elapsedMinutes)}</span
            >
          </div>
        </div>
      {/each}
    </div>
  </div>
{/if}

<!-- Records Section -->
<div class="rounded-lg border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
  <div class="mb-4 flex items-center justify-between">
    <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100">Records</h2>
    {#if records.length > 0}
      <button
        onclick={handleClearClick}
        class="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
      >
        Clear All Records
      </button>
    {/if}
  </div>

  {#if records.length === 0}
    <div class="py-8 text-center text-gray-400 dark:text-gray-500">No records yet</div>
  {:else}
    <div class="max-h-96 space-y-3 overflow-y-auto">
      {#each records as record (record.id)}
        <div
          class="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
        >
          <div class="font-mono text-sm text-gray-700 dark:text-gray-300">
            📅 {formatDate(record.startTimestamp)} ⏱ {formatTimeOnly(
              record.startTimestamp
            )}-{formatTimeOnly(record.endTimestamp)} ⏳ Duration:
            <span class="text-blue-600 dark:text-blue-400"
              >{formatElapsed(record.elapsedMinutes)}</span
            >
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Confirmation Modal -->
{#if showClearModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center">
    <!-- Backdrop -->
    <div
      class="bg-opacity-50 absolute inset-0 bg-black"
      role="button"
      tabindex="0"
      onclick={cancelClear}
      onkeydown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          cancelClear();
        }
      }}
    ></div>

    <!-- Modal -->
    <div class="relative z-10 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
      <h3 class="mb-4 text-xl font-bold text-gray-900 dark:text-gray-100">Clear All Records</h3>
      <p class="mb-6 text-gray-600 dark:text-gray-300">
        Are you sure you want to clear all records? This action cannot be undone.
      </p>
      <div class="flex justify-end gap-3">
        <button
          onclick={cancelClear}
          class="rounded-lg bg-gray-200 px-4 py-2 font-semibold text-gray-700 transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
        >
          Cancel
        </button>
        <button
          onclick={confirmClear}
          class="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-red-700"
        >
          Clear All
        </button>
      </div>
    </div>
  </div>
{/if}
