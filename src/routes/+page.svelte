<script>
	import { onMount } from 'svelte';
	import { initDB, saveRecord, getAllRecords, clearAllRecords } from '$lib/db';

	let isRunning = $state(false);
	let isPaused = $state(false);
	let elapsedTime = $state(0);
	let startTime = $state(0);
	let sessionStartTime = $state(0);
	/** @type {NodeJS.Timeout | null} */
	let intervalId = $state(null);
	/** @type {any[]} */
	let records = $state([]);
	let originalTitle = $state('');
	/** @type {NodeJS.Timeout | null} */
	let titleUpdateIntervalId = $state(null);
	let lastTitleUpdate = $state(0);
	let showClearModal = $state(false);

	onMount(async () => {
		await initDB();
		await loadRecords();
		// Store the original page title
		originalTitle = document.title;
	});

	/**
	 * Format time for title (hh:mm:ss only)
	 * @param {number} ms - Time in milliseconds
	 * @returns {string} Formatted time string
	 */
	function formatTimeForTitle(ms) {
		const totalSeconds = Math.floor(ms / 1000);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;

		return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
	}

	// Update document title every 5 seconds when running
	$effect(() => {
		if (typeof document !== 'undefined') {
			if (isRunning || isPaused) {
				// Update immediately if this is the first update or 5 seconds have passed
				const now = Date.now();
				if (now - lastTitleUpdate >= 5000 || lastTitleUpdate === 0) {
					document.title = `${formatTimeForTitle(elapsedTime)} - Stopwatch`;
					lastTitleUpdate = now;
				}
			} else if (elapsedTime === 0 && originalTitle) {
				document.title = originalTitle;
				lastTitleUpdate = 0;
			}
		}
	});

	/**
	 * Format time with milliseconds
	 * @param {number} ms - Time in milliseconds
	 * @returns {string} Formatted time string with milliseconds
	 */
	function formatTime(ms) {
		const totalSeconds = Math.floor(ms / 1000);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;
		const milliseconds = Math.floor((ms % 1000) / 10);

		return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(2, '0')}`;
	}

	/**
	 * Format timestamp as yyyy-MM-dd HH:mm:ss
	 * @param {number} timestamp - Timestamp in milliseconds
	 * @returns {string} Formatted timestamp string
	 */
	function formatTimestamp(timestamp) {
		const date = new Date(timestamp);
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');
		const seconds = String(date.getSeconds()).padStart(2, '0');
		return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
	}

	/**
	 * Format elapsed time as hh:mm (with 1 minute minimum display)
	 * @param {number} minutes - Time in minutes
	 * @returns {string} Formatted elapsed time
	 */
	function formatElapsed(minutes) {
		// Show at least 1 minute if less than 1 minute
		const displayMinutes = minutes < 1 ? 1 : minutes;
		const hours = Math.floor(displayMinutes / 60);
		const mins = displayMinutes % 60;
		return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
	}

	async function loadRecords() {
		records = await getAllRecords();
	}

	async function start() {
		if (!isRunning) {
			// If starting from stopped state (not paused), reset timer
			if (!isPaused && elapsedTime > 0) {
				// This is a restart after stop - reset everything
				elapsedTime = 0;
				startTime = 0;
				sessionStartTime = Date.now();
			} else if (elapsedTime === 0) {
				// Fresh start
				sessionStartTime = Date.now();
			}
			// else: resuming from pause, keep sessionStartTime

			isRunning = true;
			isPaused = false;
			startTime = Date.now() - elapsedTime;
			intervalId = setInterval(() => {
				elapsedTime = Date.now() - startTime;
			}, 10);

			// Set up title update interval (every 5 seconds)
			if (titleUpdateIntervalId) {
				clearInterval(titleUpdateIntervalId);
			}
			titleUpdateIntervalId = setInterval(() => {
				if (typeof document !== 'undefined') {
					document.title = `${formatTimeForTitle(elapsedTime)} - Stopwatch`;
					lastTitleUpdate = Date.now();
				}
			}, 5000);

			// Update title immediately when starting
			if (typeof document !== 'undefined') {
				document.title = `${formatTimeForTitle(elapsedTime)} - Stopwatch`;
				lastTitleUpdate = Date.now();
			}
		}
	}

	async function pause() {
		if (isRunning) {
			isRunning = false;
			isPaused = true;
			if (intervalId) {
				clearInterval(intervalId);
			}
			// Clear title update interval when pausing
			if (titleUpdateIntervalId) {
				clearInterval(titleUpdateIntervalId);
			}
			titleUpdateIntervalId = null;
		}
	}

	async function stop() {
		isRunning = false;
		isPaused = false;
		if (intervalId) {
			clearInterval(intervalId);
		}
		// Clear title update interval when stopping
		if (titleUpdateIntervalId) {
			clearInterval(titleUpdateIntervalId);
		}
		titleUpdateIntervalId = null;

		const endTimestamp = Date.now();

		// Save the record (only if there's actual time recorded and it's not a duplicate)
		if (elapsedTime > 0 && sessionStartTime > 0) {
			// Check if the last record has the same start timestamp (duplicate prevention)
			const isDuplicate = records.length > 0 && records[records.length - 1].startTimestamp === sessionStartTime;
			
			if (!isDuplicate) {
				await saveRecord(sessionStartTime, endTimestamp);
				await loadRecords();
			}
		}

		// DON'T reset elapsedTime - keep it frozen
		// elapsedTime stays as is (frozen)
		sessionStartTime = 0;
	}

	async function clearRecords() {
		showClearModal = true;
	}

	async function confirmClearRecords() {
		await clearAllRecords();
		await loadRecords();
		showClearModal = false;
	}

	function cancelClearRecords() {
		showClearModal = false;
	}
</script>

<svelte:head>
	<title>Stopwatch</title>
</svelte:head>

<main class="flex min-h-screen flex-col items-center justify-center bg-white p-4 dark:bg-gray-900">
	<div class="w-full max-w-5xl">
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

		<!-- Records - Simplified -->
		<div
			class="rounded-lg border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800"
		>
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100">Records</h2>
				{#if records.length > 0}
					<button
						onclick={clearRecords}
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
								<span class="font-semibold">start:</span>
								{formatTimestamp(record.startTimestamp)} |
								<span class="font-semibold">end:</span>
								{formatTimestamp(record.endTimestamp)} |
								<span class="font-semibold">elapsed:</span>
								<span class="text-blue-600 dark:text-blue-400">{formatElapsed(record.elapsedMinutes)}</span>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	<!-- Confirmation Modal -->
	{#if showClearModal}
		<div class="fixed inset-0 z-50 flex items-center justify-center">
			<!-- Backdrop -->
			<div 
				class="absolute inset-0 bg-black bg-opacity-50" 
				role="button"
				tabindex="0"
				onclick={cancelClearRecords}
				onkeydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						cancelClearRecords();
					}
				}}
			></div>
			
			<!-- Modal -->
			<div class="relative z-10 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
				<h3 class="mb-4 text-xl font-bold text-gray-900 dark:text-gray-100">
					Clear All Records
				</h3>
				<p class="mb-6 text-gray-600 dark:text-gray-300">
					Are you sure you want to clear all records? This action cannot be undone.
				</p>
				<div class="flex justify-end gap-3">
					<button
						onclick={cancelClearRecords}
						class="rounded-lg bg-gray-200 px-4 py-2 font-semibold text-gray-700 transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
					>
						Cancel
					</button>
					<button
						onclick={confirmClearRecords}
						class="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-red-700"
					>
						Clear All
					</button>
				</div>
			</div>
		</div>
	{/if}
</main>
