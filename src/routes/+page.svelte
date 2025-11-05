<script>
	import { onMount } from 'svelte';
	import { initDB, saveRecord, getAllRecords, clearAllRecords } from '$lib/db';

	let isRunning = false;
	let isPaused = false;
	let elapsedTime = 0;
	let startTime = 0;
	let sessionStartTime = 0;
	let currentSegmentStart = 0;
	let workSegments = [];
	let intervalId = null;
	let records = [];

	onMount(async () => {
		await initDB();
		await loadRecords();
	});

	function formatTime(ms) {
		const totalSeconds = Math.floor(ms / 1000);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;
		const milliseconds = Math.floor((ms % 1000) / 10);

		return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(2, '0')}`;
	}

	function formatDate(isoString) {
		const date = new Date(isoString);
		return date.toLocaleString();
	}

	function formatTimeOnly(timestamp) {
		const date = new Date(timestamp);
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');
		const seconds = String(date.getSeconds()).padStart(2, '0');
		return `${hours}:${minutes}:${seconds}`;
	}

	function calculateTotalWorkTime(segments) {
		if (!segments || segments.length === 0) return 0;
		return segments.reduce((total, segment) => total + segment.duration, 0);
	}

	function calculateTotalPauseTime(startTimestamp, endTimestamp, workSegments) {
		if (!workSegments || workSegments.length === 0) return 0;
		const totalSessionTime = endTimestamp - startTimestamp;
		const totalWorkTime = calculateTotalWorkTime(workSegments);
		return totalSessionTime - totalWorkTime;
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
				workSegments = [];
			}
			// Record the start of this work segment
			currentSegmentStart = Date.now();
			startTime = Date.now() - elapsedTime;
			intervalId = setInterval(() => {
				elapsedTime = Date.now() - startTime;
			}, 10);
		}
	}

	async function pause() {
		if (isRunning) {
			isRunning = false;
			isPaused = true;
			clearInterval(intervalId);
			// Record the end of this work segment
			const segmentEnd = Date.now();
			workSegments.push({
				start: currentSegmentStart,
				end: segmentEnd,
				duration: segmentEnd - currentSegmentStart
			});
		}
	}

	async function stop() {
		isRunning = false;
		isPaused = false;
		clearInterval(intervalId);
		
		// If currently running (not paused), add the final segment
		if (currentSegmentStart > 0) {
			const segmentEnd = Date.now();
			workSegments.push({
				start: currentSegmentStart,
				end: segmentEnd,
				duration: segmentEnd - currentSegmentStart
			});
		}
		
		const endTimestamp = Date.now();
		
		// Format the session start date as dd/MM/yyyy-hh:mm:ss
		const startDate = new Date(sessionStartTime);
		const day = String(startDate.getDate()).padStart(2, '0');
		const month = String(startDate.getMonth() + 1).padStart(2, '0');
		const year = startDate.getFullYear();
		const hours = String(startDate.getHours()).padStart(2, '0');
		const minutes = String(startDate.getMinutes()).padStart(2, '0');
		const seconds = String(startDate.getSeconds()).padStart(2, '0');
		const formattedStartDate = `${day}/${month}/${year}-${hours}:${minutes}:${seconds}`;
		
		// Calculate elapsed time in minutes
		const elapsedMinutes = Math.floor(elapsedTime / 60000);
		const elapsedHours = Math.floor(elapsedMinutes / 60);
		const remainingMinutes = elapsedMinutes % 60;
		const elapsedTimeStr = elapsedHours > 0 
			? `${elapsedHours}h ${remainingMinutes}m`
			: `${remainingMinutes}m`;
		
		// Create session name
		const sessionName = `session from start date ${formattedStartDate} (${elapsedTimeStr})`;
		
		// Save the record with work segments
		await saveRecord(sessionName, sessionStartTime, endTimestamp, elapsedTime, workSegments);
		await loadRecords();
		
		elapsedTime = 0;
		startTime = 0;
		sessionStartTime = 0;
		currentSegmentStart = 0;
		workSegments = [];
	}

	function clear() {
		isRunning = false;
		isPaused = false;
		clearInterval(intervalId);
		elapsedTime = 0;
		startTime = 0;
		sessionStartTime = 0;
		currentSegmentStart = 0;
		workSegments = [];
	}

	async function clearRecords() {
		if (confirm('Are you sure you want to clear all records?')) {
			await clearAllRecords();
			await loadRecords();
		}
	}
</script>

<main class="bg-white flex min-h-screen flex-col items-center justify-center p-4">
	<div class="w-full max-w-5xl">
		<!-- Time Display - Centered and Huge -->
		<div class="mb-12 text-center">
			<h1 class="font-mono text-8xl md:text-9xl font-bold text-gray-900 tabular-nums tracking-tight">
				{formatTime(elapsedTime)}
			</h1>
		</div>

		<!-- Controls - Large Buttons -->
		<div class="mb-12 flex flex-col gap-4 md:flex-row md:justify-center">
			{#if !isRunning && !isPaused}
				<button
					on:click={start}
					class="bg-green-600 hover:bg-green-700 active:bg-green-800 rounded-lg px-16 py-8 text-3xl font-bold text-white transition-colors md:text-4xl"
				>
					Start
				</button>
			{/if}

			{#if isRunning}
				<button
					on:click={pause}
					class="bg-green-600 hover:bg-green-700 active:bg-green-800 rounded-lg px-16 py-8 text-3xl font-bold text-white transition-colors md:text-4xl"
				>
					Pause
				</button>
			{/if}

			{#if isPaused}
				<button
					on:click={start}
					class="bg-green-600 hover:bg-green-700 active:bg-green-800 rounded-lg px-16 py-8 text-3xl font-bold text-white transition-colors md:text-4xl"
				>
					Continue
				</button>
			{/if}

			{#if isRunning || isPaused}
				<button
					on:click={stop}
					class="bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-lg px-16 py-8 text-3xl font-bold text-white transition-colors md:text-4xl"
				>
					Stop
				</button>
			{/if}

			<button
				on:click={clear}
				class="bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-lg px-16 py-8 text-3xl font-bold text-white transition-colors md:text-4xl"
			>
				Clear
			</button>
		</div>

		<!-- Records - Simplified -->
		<div class="rounded-lg border border-gray-200 bg-gray-50 p-6">
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-2xl font-bold text-gray-900">Records</h2>
				{#if records.length > 0}
					<button
						on:click={clearRecords}
						class="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
					>
						Clear All
					</button>
				{/if}
			</div>

			{#if records.length === 0}
				<div class="py-8 text-center text-gray-400">
					No records yet
				</div>
			{:else}
				<div class="max-h-96 space-y-3 overflow-y-auto">
					{#each records as record}
						<div
							class="flex flex-col gap-3 rounded border border-gray-200 bg-white p-4"
						>
							<span class="font-semibold text-gray-700">
								⏹️ {record.sessionName}
							</span>
							
							<!-- Session Times -->
							<div class="flex flex-col gap-1 text-sm text-gray-600 border-l-2 border-blue-400 pl-3">
								<div class="flex gap-2">
									<span class="font-medium">Start:</span>
									<span>{formatTimeOnly(record.startTimestamp)}</span>
								</div>
								<div class="flex gap-2">
									<span class="font-medium">End:</span>
									<span>{formatTimeOnly(record.endTimestamp)}</span>
								</div>
								<div class="flex gap-2">
									<span class="font-medium">Total Elapsed:</span>
									<span class="font-mono">{formatTime(record.elapsed)}</span>
								</div>
							</div>

							<!-- Work Segments -->
							{#if record.workSegments && record.workSegments.length > 0}
								<div class="flex flex-col gap-2 text-sm">
									<div class="font-medium text-gray-700">Work Segments:</div>
									<div class="space-y-1 border-l-2 border-green-400 pl-3">
										{#each record.workSegments as segment, index}
											<div class="flex gap-2 text-gray-600">
												<span class="font-medium">#{index + 1}:</span>
												<span>{formatTimeOnly(segment.start)} → {formatTimeOnly(segment.end)}</span>
												<span class="font-mono text-green-700">({formatTime(segment.duration)})</span>
											</div>
										{/each}
									</div>
									<div class="flex gap-4 text-xs text-gray-500 mt-1">
										<span>
											<span class="font-medium">Total Work:</span> 
											<span class="font-mono text-green-700">{formatTime(calculateTotalWorkTime(record.workSegments))}</span>
										</span>
										<span>
											<span class="font-medium">Total Pause:</span> 
											<span class="font-mono text-orange-600">{formatTime(calculateTotalPauseTime(record.startTimestamp, record.endTimestamp, record.workSegments))}</span>
										</span>
									</div>
								</div>
							{/if}

							<div class="text-xs text-gray-400 pt-2 border-t">
								Recorded: {formatDate(record.date)}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</main>
