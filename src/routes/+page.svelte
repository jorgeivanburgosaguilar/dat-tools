<script>
	import { onMount } from 'svelte';
	import { initDB, saveRecord, getAllRecords, clearAllRecords } from '$lib/db';
	import Stopwatch from '$lib/components/Stopwatch.svelte';
	import RecordsList from '$lib/components/RecordsList.svelte';

	/** @type {any[]} */
	let records = $state([]);
	let originalTitle = $state('');
	let currentElapsedTime = $state(0);
	/** @type {NodeJS.Timeout | null} */
	let titleUpdateIntervalId = $state(null);

	onMount(() => {
		// Run async initialization separately
		(async () => {
			await initDB();
			await loadRecords();
		})();

		// Store the original page title
		originalTitle = document.title;

		// Cleanup interval on unmount
		return () => {
			if (titleUpdateIntervalId) {
				clearInterval(titleUpdateIntervalId);
			}
		};
	});

	/**
	 * Handle stopwatch start - start title updates
	 * @param {{ elapsedTime: number }} detail - The start event detail from the stopwatch component
	 */
	function handleStopwatchStart(detail) {
		const { elapsedTime } = detail;
		currentElapsedTime = elapsedTime;

		// Update title immediately
		if (typeof document !== 'undefined') {
			document.title = `${formatTimeForTitle(currentElapsedTime)} - Stopwatch`;
		}

		// Clear any existing interval
		if (titleUpdateIntervalId) {
			clearInterval(titleUpdateIntervalId);
		}

		// Set up title update interval (every 5 seconds)
		titleUpdateIntervalId = setInterval(() => {
			// Get current elapsed time by calculating from start
			currentElapsedTime += 5000; // Add 5 seconds
			if (typeof document !== 'undefined') {
				document.title = `${formatTimeForTitle(currentElapsedTime)} - Stopwatch`;
			}
		}, 5000);
	}

	/**
	 * Handle stopwatch pause - stop title updates
	 * @param {{ elapsedTime: number }} detail - The pause event detail from the stopwatch component
	 */
	function handleStopwatchPause(detail) {
		const { elapsedTime } = detail;
		currentElapsedTime = elapsedTime;

		// Clear title update interval
		if (titleUpdateIntervalId) {
			clearInterval(titleUpdateIntervalId);
			titleUpdateIntervalId = null;
		}

		// Update title one last time with paused time
		if (typeof document !== 'undefined') {
			document.title = `${formatTimeForTitle(currentElapsedTime)} - Stopwatch`;
		}
	}

	/**
	 * Handle stopwatch stop - save record and update title
	 * @param {{ elapsedTime: number, sessionStartTime: number, endTimestamp: number }} detail - The stop event detail from the stopwatch component
	 */
	async function handleStopwatchStop(detail) {
		const { elapsedTime, sessionStartTime, endTimestamp } = detail;

		// Clear title update interval
		if (titleUpdateIntervalId) {
			clearInterval(titleUpdateIntervalId);
			titleUpdateIntervalId = null;
		}

		// Save the record (only if there's actual time recorded and it's not a duplicate)
		if (elapsedTime > 0 && sessionStartTime > 0) {
			// Check if the last record has the same start timestamp (duplicate prevention)
			const isDuplicate =
				records.length > 0 && records[records.length - 1].startTimestamp === sessionStartTime;

			if (!isDuplicate) {
				await saveRecord(sessionStartTime, endTimestamp, elapsedTime);
				await loadRecords();
			}
		}

		// Reset title to original
		if (originalTitle) {
			document.title = originalTitle;
		}
	}

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

	/**
	 * Format timestamp date as yyyy-MM-dd
	 * @param {number} timestamp - Timestamp in milliseconds
	 * @returns {string} Formatted date string
	 */
	function formatDate(timestamp) {
		const date = new Date(timestamp);
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	/**
	 * Format timestamp time as HH:mm:ss
	 * @param {number} timestamp - Timestamp in milliseconds
	 * @returns {string} Formatted time string
	 */
	function formatTimeOnly(timestamp) {
		const date = new Date(timestamp);
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');
		const seconds = String(date.getSeconds()).padStart(2, '0');
		return `${hours}:${minutes}:${seconds}`;
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

	/**
	 * Format a record row for display in the RecordsList component
	 * @param {any} record - The record object to format
	 * @returns {string} HTML string for the record row
	 */
	function formatRecordRow(record) {
		return `📅 ${formatDate(record.startTimestamp)} ⏱ ${formatTimeOnly(record.startTimestamp)}-${formatTimeOnly(record.endTimestamp)} ⏳ Duration: <span class="text-blue-600 dark:text-blue-400">${formatElapsed(record.elapsedMinutes)}</span>`;
	}

	async function loadRecords() {
		records = await getAllRecords();
	}

	async function handleClearRecords() {
		await clearAllRecords();
		await loadRecords();
	}
</script>

<svelte:head>
	<title>Stopwatch</title>
</svelte:head>

<main class="flex min-h-screen flex-col items-center justify-center bg-white p-4 dark:bg-gray-900">
	<div class="w-full max-w-5xl">
		<!-- Stopwatch Component -->
		<Stopwatch
			onstart={handleStopwatchStart}
			onpause={handleStopwatchPause}
			onstop={handleStopwatchStop}
		/>

		<!-- Records Component -->
		<RecordsList
			title="Records"
			{records}
			clearButtonText="Clear All Records"
			emptyMessage="No records yet"
			formatRow={formatRecordRow}
			onclear={handleClearRecords}
		/>

		<div class="p-6 text-center">
			<h4 class="font-mono font-bold tracking-tight text-gray-900 tabular-nums dark:text-gray-100">
				Version 1.0
			</h4>
		</div>
	</div>
</main>
