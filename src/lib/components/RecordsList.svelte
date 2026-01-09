<script>
	/**
	 * @typedef {Object} RecordsListProps
	 * @property {string} title - The title of the records section
	 * @property {Array<any>} records - Array of record objects to display
	 * @property {string} clearButtonText - Text for the clear all button
	 * @property {string} emptyMessage - Message to display when no records exist
	 * @property {(record: any) => string} formatRow - Function to format each record row
	 * @property {() => void | Promise<void>} onclear - Callback when clear is confirmed
	 */

	let { title = 'Records', records = [], clearButtonText = 'Clear All', emptyMessage = 'No records yet', formatRow, onclear } = $props();

	let showClearModal = $state(false);

	/**
	 * Open the clear confirmation modal
	 */
	function handleClearClick() {
		showClearModal = true;
	}

	/**
	 * Confirm and execute the clear action
	 */
	async function confirmClear() {
		if (onclear) {
			await onclear();
		}
		showClearModal = false;
	}

	/**
	 * Cancel the clear action
	 */
	function cancelClear() {
		showClearModal = false;
	}
</script>

<div
	class="rounded-lg border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800"
>
	<div class="mb-4 flex items-center justify-between">
		<h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100">{title}</h2>
		{#if records.length > 0}
			<button
				onclick={handleClearClick}
				class="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
			>
				{clearButtonText}
			</button>
		{/if}
	</div>

	{#if records.length === 0}
		<div class="py-8 text-center text-gray-400 dark:text-gray-500">{emptyMessage}</div>
	{:else}
		<div class="max-h-96 space-y-3 overflow-y-auto">
			{#each records as record (record.id)}
				<div
					class="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
				>
					<div class="font-mono text-sm text-gray-700 dark:text-gray-300">
						{@html formatRow(record)}
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
