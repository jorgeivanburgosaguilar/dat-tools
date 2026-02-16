<script>
  /**
   * WordCounter Component
   * Dynamically counts words, characters, sentences and paragraphs from user input.
   * Displays a word density table showing most frequent words.
   * All counting logic lives in $lib/word-counter.js for testability.
   */

  import {
    countWords,
    countSentences,
    countParagraphs,
    countCharacters,
    countCharactersNoSpaces,
    computeWordDensity
  } from '$lib/word-counter.js';

  /**
   * @typedef {import('$lib/word-counter.js').WordCounterStats} WordCounterStats
   */

  /**
   * @type {{
   *   onchange?: (stats: WordCounterStats) => void
   * }}
   */
  let { onchange = () => {} } = $props();

  let text = $state('');

  let characters = $derived(countCharacters(text));
  let charactersNoSpaces = $derived(countCharactersNoSpaces(text));
  let words = $derived(countWords(text));
  let sentences = $derived(countSentences(text));
  let paragraphs = $derived(countParagraphs(text));
  let density = $derived(computeWordDensity(text));

  $effect(() => {
    onchange({ characters, charactersNoSpaces, words, sentences, paragraphs });
  });

  function handleClear() {
    text = '';
  }
</script>

<div class="w-full">
  <!-- Stats Grid -->
  <div class="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
    <div
      class="rounded-xl border border-gray-200 bg-gray-50 p-4 text-center dark:border-gray-700 dark:bg-gray-800"
    >
      <p class="font-mono text-3xl font-bold text-blue-600 tabular-nums dark:text-blue-400">
        {words}
      </p>
      <p class="mt-1 text-sm font-medium text-gray-500 dark:text-gray-400">Words</p>
    </div>
    <div
      class="rounded-xl border border-gray-200 bg-gray-50 p-4 text-center dark:border-gray-700 dark:bg-gray-800"
    >
      <p class="font-mono text-3xl font-bold text-green-600 tabular-nums dark:text-green-400">
        {characters}
      </p>
      <p class="mt-1 text-sm font-medium text-gray-500 dark:text-gray-400">Characters</p>
    </div>
    <div
      class="rounded-xl border border-gray-200 bg-gray-50 p-4 text-center dark:border-gray-700 dark:bg-gray-800"
    >
      <p class="font-mono text-3xl font-bold text-teal-600 tabular-nums dark:text-teal-400">
        {charactersNoSpaces}
      </p>
      <p class="mt-1 text-sm font-medium text-gray-500 dark:text-gray-400">No Spaces</p>
    </div>
    <div
      class="rounded-xl border border-gray-200 bg-gray-50 p-4 text-center dark:border-gray-700 dark:bg-gray-800"
    >
      <p class="font-mono text-3xl font-bold text-yellow-600 tabular-nums dark:text-yellow-400">
        {sentences}
      </p>
      <p class="mt-1 text-sm font-medium text-gray-500 dark:text-gray-400">Sentences</p>
    </div>
    <div
      class="rounded-xl border border-gray-200 bg-gray-50 p-4 text-center dark:border-gray-700 dark:bg-gray-800"
    >
      <p class="font-mono text-3xl font-bold text-purple-600 tabular-nums dark:text-purple-400">
        {paragraphs}
      </p>
      <p class="mt-1 text-sm font-medium text-gray-500 dark:text-gray-400">Paragraphs</p>
    </div>
  </div>

  <!-- Textarea -->
  <div class="relative">
    <textarea
      bind:value={text}
      placeholder="Start typing or paste your text here..."
      rows="12"
      class="w-full resize-y rounded-xl border border-gray-300 bg-white p-4 font-mono text-base text-gray-900 placeholder-gray-400 transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:border-blue-400 dark:focus:ring-blue-400"
    ></textarea>
  </div>

  <!-- Clear button -->
  {#if text.length > 0}
    <div class="mt-4 text-center">
      <button
        onclick={handleClear}
        class="rounded-lg bg-red-600 px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 active:bg-red-800"
      >
        Clear Text
      </button>
    </div>
  {/if}

  <!-- Word Density Table -->
  {#if density.length > 0}
    <div class="mt-8">
      <h2 class="mb-4 text-center font-mono text-xl font-bold text-gray-900 dark:text-gray-100">
        Word Density
      </h2>
      <div class="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
        <table class="w-full text-left text-sm">
          <thead>
            <tr class="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
              <th class="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">#</th>
              <th class="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Word</th>
              <th class="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-300">
                Count
              </th>
              <th class="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-300">
                Frequency
              </th>
            </tr>
          </thead>
          <tbody>
            {#each density as entry, i (entry.word)}
              <tr
                class="border-b border-gray-100 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50"
              >
                <td class="px-4 py-2 font-mono text-gray-400 tabular-nums dark:text-gray-500">
                  {i + 1}
                </td>
                <td class="px-4 py-2 font-mono font-medium text-gray-900 dark:text-gray-100">
                  {entry.word}
                </td>
                <td
                  class="px-4 py-2 text-right font-mono text-gray-700 tabular-nums dark:text-gray-300"
                >
                  {entry.count}
                </td>
                <td class="px-4 py-2 text-right">
                  <div class="flex items-center justify-end gap-2">
                    <div class="h-2 w-16 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                      <div
                        class="h-full rounded-full bg-blue-500 dark:bg-blue-400"
                        style="width: {entry.percentage}%"
                      ></div>
                    </div>
                    <span class="font-mono text-xs text-gray-500 tabular-nums dark:text-gray-400">
                      {entry.percentage}%
                    </span>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>
