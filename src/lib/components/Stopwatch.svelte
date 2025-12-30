<script>
	/**
	 * Stopwatch Component
	 * Handles start, pause, continue, and stop functionality independently
	 * Emits 'stop' event with timing data when stopped
	 */

	let isRunning = $state(false);
	let isPaused = $state(false);
	let elapsedTime = $state(0);
	let startTime = $state(0);
	let sessionStartTime = $state(0);
	/** @type {NodeJS.Timeout | null} */
	let intervalId = $state(null);

	/**
	 * Format time without milliseconds
	 * @param {number} ms - Time in milliseconds
	 * @returns {string} Formatted time string (hh:mm:ss)
	 */
	function formatTime(ms) {
		const totalSeconds = Math.floor(ms / 1000);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;

		return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
	}

	/**
	 * Start or continue the stopwatch
	 */
	function start() {
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
			}, 1000);
		}
	}

	/**
	 * Pause the stopwatch
	 */
	function pause() {
		if (isRunning) {
			isRunning = false;
			isPaused = true;
			if (intervalId) {
				clearInterval(intervalId);
				intervalId = null;
			}
		}
	}

	/**
	 * Stop the stopwatch and emit event with timing data
	 */
	function stop() {
		isRunning = false;
		isPaused = false;
		if (intervalId) {
			clearInterval(intervalId);
			intervalId = null;
		}

		const endTimestamp = Date.now();

		// Dispatch stop event with timing data
		if (elapsedTime > 0 && sessionStartTime > 0) {
			const event = new CustomEvent('stopwatch-stop', {
				detail: {
					elapsedTime,
					sessionStartTime,
					endTimestamp
				},
				bubbles: true,
				cancelable: true
			});
			document.dispatchEvent(event);
		}

		// DON'T reset elapsedTime - keep it frozen
		sessionStartTime = 0;
	}

	/**
	 * Get current elapsed time (for parent component to read)
	 */
	function getElapsedTime() {
		return elapsedTime;
	}

	/**
	 * Get running state (for parent component to read)
	 */
	function isStopwatchRunning() {
		return isRunning;
	}

	/**
	 * Get paused state (for parent component to read)
	 */
	function isStopwatchPaused() {
		return isPaused;
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
