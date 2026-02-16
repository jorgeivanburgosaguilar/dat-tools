/**
 * Word counter utility functions.
 * Pure functions for counting words, characters, sentences, paragraphs,
 * and computing word density from text input.
 */

/**
 * @typedef {Object} WordCounterStats
 * @property {number} characters - Total character count
 * @property {number} charactersNoSpaces - Character count excluding spaces
 * @property {number} words - Word count
 * @property {number} sentences - Sentence count
 * @property {number} paragraphs - Paragraph count
 */

/**
 * @typedef {Object} WordDensityEntry
 * @property {string} word - The word (lowercased)
 * @property {number} count - Number of occurrences
 * @property {number} percentage - Percentage of total words
 */

/**
 * Count the number of words in a string.
 * @param {string} str
 * @returns {number}
 */
export function countWords(str) {
  const trimmed = str.trim();
  if (trimmed === '') return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Count the number of sentences in a string.
 * Sentences are delimited by `.`, `!`, or `?`.
 * @param {string} str
 * @returns {number}
 */
export function countSentences(str) {
  const trimmed = str.trim();
  if (trimmed === '') return 0;
  const matches = trimmed.match(/[.!?]+/g);
  return matches ? matches.length : 0;
}

/**
 * Count the number of paragraphs in a string.
 * Paragraphs are separated by one or more blank lines.
 * @param {string} str
 * @returns {number}
 */
export function countParagraphs(str) {
  const trimmed = str.trim();
  if (trimmed === '') return 0;
  return trimmed.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length;
}

/**
 * Count total characters in a string.
 * @param {string} str
 * @returns {number}
 */
export function countCharacters(str) {
  return str.length;
}

/**
 * Count characters excluding whitespace.
 * @param {string} str
 * @returns {number}
 */
export function countCharactersNoSpaces(str) {
  return str.replace(/\s/g, '').length;
}

/**
 * Compute all stats for a given text.
 * @param {string} str
 * @returns {WordCounterStats}
 */
export function computeStats(str) {
  return {
    characters: countCharacters(str),
    charactersNoSpaces: countCharactersNoSpaces(str),
    words: countWords(str),
    sentences: countSentences(str),
    paragraphs: countParagraphs(str)
  };
}

/**
 * Compute word density — frequency of each word sorted by count descending.
 * Words are lowercased and stripped of leading/trailing punctuation.
 * @param {string} str
 * @param {number} [limit=10] - Maximum number of entries to return
 * @returns {WordDensityEntry[]}
 */
export function computeWordDensity(str, limit = 10) {
  const trimmed = str.trim();
  if (trimmed === '') return [];

  const words = trimmed.split(/\s+/).map((w) => w.replace(/^[^\w]+|[^\w]+$/g, '').toLowerCase());

  /** @type {Map<string, number>} */
  const freq = new Map();
  for (const word of words) {
    if (word === '' || word.length < 3) continue;
    freq.set(word, (freq.get(word) || 0) + 1);
  }

  const totalWords = words.filter((w) => w !== '').length;

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word, count]) => ({
      word,
      count,
      percentage: Math.round((count / totalWords) * 1000) / 10
    }));
}
