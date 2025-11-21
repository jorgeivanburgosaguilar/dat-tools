<script>
	import { onMount } from 'svelte';
	import { initDB, saveRecord, getAllRecords, clearAllRecords } from '$lib/db';

	let isRunning = $state(false);
	let isPaused = $state(false);
	let elapsedTime = $state(0);
	let startTime = $state(0);
	let sessionStartTime = $state(0);
	let intervalId = $state(null);
	let records = $state([]);
	let originalTitle = $state('');
	let titleUpdateIntervalId = $state(null);
	let lastTitleUpdate = $state(0);

	onMount(async () => {
		await initDB();
		await loadRecords();
		// Store the original page title
		originalTitle = document.title;
	});

	// Format time for title (hh:mm:ss only)
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

	function formatTime(ms) {
		const totalSeconds = Math.floor(ms / 1000);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;
		const milliseconds = Math.floor((ms % 1000) / 10);

		return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(2, '0')}`;
	}

	// Format timestamp as yyyy-MM-dd HH:mm:ss
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

	// Format elapsed time as hh:mm (with 1 minute minimum)
	function formatElapsed(ms) {
		const totalMinutes = Math.floor(ms / 60000);
		// Show at least 1 minute if less than 1 minute
		if (totalMinutes < 1) {
			return '00:01';
		}
		const hours = Math.floor(totalMinutes / 60);
		const minutes = totalMinutes % 60;
		return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
	}

	async function loadRecords() {
		records = await getAllRecords();
	}

	async function start() {
		if (!isRunning) {
			isRunning = true;
			isPaused = false;
			// If starting fresh (not resuming), record the session start time
			if (elapsedTime === 0) {
				sessionStartTime = Date.now();
			}
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
			clearInterval(intervalId);
			// Clear title update interval when pausing
			if (titleUpdateIntervalId) {
				clearInterval(titleUpdateIntervalId);
				titleUpdateIntervalId = null;
			}
		}
	}

	async function stop() {
		isRunning = false;
		isPaused = false;
		clearInterval(intervalId);
		// Clear title update interval when stopping
		if (titleUpdateIntervalId) {
			clearInterval(titleUpdateIntervalId);
			titleUpdateIntervalId = null;
		}

		const endTimestamp = Date.now();

		// Save the record
		await saveRecord(sessionStartTime, endTimestamp);
		await loadRecords();

		elapsedTime = 0;
		startTime = 0;
		sessionStartTime = 0;
	}

	function clear() {
		isRunning = false;
		isPaused = false;
		clearInterval(intervalId);
		// Clear title update interval when clearing
		if (titleUpdateIntervalId) {
			clearInterval(titleUpdateIntervalId);
			titleUpdateIntervalId = null;
		}
		elapsedTime = 0;
		startTime = 0;
		sessionStartTime = 0;
		lastTitleUpdate = 0;
		// Restore original title when clearing
		if (originalTitle) {
			document.title = originalTitle;
		}
	}

	async function clearRecords() {
		if (confirm('Are you sure you want to clear all records?')) {
			await clearAllRecords();
			await loadRecords();
		}
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
					on:click={start}
					class="rounded-lg bg-green-600 px-16 py-8 text-3xl font-bold text-white transition-colors hover:bg-green-700 active:bg-green-800 md:text-4xl"
				>
					Start
				</button>
			{/if}

			{#if isRunning}
				<button
					on:click={pause}
					class="rounded-lg bg-green-600 px-16 py-8 text-3xl font-bold text-white transition-colors hover:bg-green-700 active:bg-green-800 md:text-4xl"
				>
					Pause
				</button>
			{/if}

			{#if isPaused}
				<button
					on:click={start}
					class="rounded-lg bg-green-600 px-16 py-8 text-3xl font-bold text-white transition-colors hover:bg-green-700 active:bg-green-800 md:text-4xl"
				>
					Continue
				</button>
			{/if}

			{#if isRunning || isPaused}
				<button
					on:click={stop}
					class="rounded-lg bg-red-600 px-16 py-8 text-3xl font-bold text-white transition-colors hover:bg-red-700 active:bg-red-800 md:text-4xl"
				>
					Stop
				</button>
			{/if}

			<button
				on:click={clear}
				class="rounded-lg bg-red-600 px-16 py-8 text-3xl font-bold text-white transition-colors hover:bg-red-700 active:bg-red-800 md:text-4xl"
			>
				Clear
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
						on:click={clearRecords}
						class="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
					>
						Clear All
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
								<span class="text-blue-600 dark:text-blue-400">{formatElapsed(record.endTimestamp - record.startTimestamp)}</span>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</main>
