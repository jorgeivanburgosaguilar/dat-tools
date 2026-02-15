<svelte:head>
	<title>Tools</title>
</svelte:head>

<main class="flex min-h-screen flex-col items-center justify-center bg-white p-4 dark:bg-gray-900">
	<div class="w-full max-w-3xl">
		<h1
			class="mb-8 text-center font-mono text-4xl font-bold tracking-tight text-gray-900 dark:text-gray-100"
		>
			Tools
		</h1>

		<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
			<a
				href="/stopwatch"
				class="group rounded-2xl border border-gray-200 bg-gray-50 p-6 transition-all hover:border-blue-400 hover:shadow-lg dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-500"
			>
				<div class="mb-3 text-4xl">&#x23F1;&#xFE0F;</div>
				<h2
					class="mb-2 font-mono text-xl font-bold text-gray-900 group-hover:text-blue-600 dark:text-gray-100 dark:group-hover:text-blue-400"
				>
					Stopwatch
				</h2>
				<p class="text-sm text-gray-600 dark:text-gray-400">
					Track time with start, pause and stop controls
				</p>
			</a>

			<a
				href="/word-counter"
				class="group rounded-2xl border border-gray-200 bg-gray-50 p-6 transition-all hover:border-blue-400 hover:shadow-lg dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-500"
			>
				<div class="mb-3 text-4xl">&#x1F4DD;</div>
				<h2
					class="mb-2 font-mono text-xl font-bold text-gray-900 group-hover:text-blue-600 dark:text-gray-100 dark:group-hover:text-blue-400"
				>
					Word Counter
				</h2>
				<p class="text-sm text-gray-600 dark:text-gray-400">Count words, characters and more</p>
			</a>
		</div>
	</div>
</main>
