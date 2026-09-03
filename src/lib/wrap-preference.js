/**
 * localStorage persistence for a tool's "wrap long lines" toggle. Each tool that shows a
 * line-numbered or code view (diff checker, JSON validator, agent trajectory viewer) keeps its own
 * preference, namespaced by `tool`, so turning wrap off in one tool doesn't affect another.
 * Privacy-first, like `stopwatch-storage.js`: this is the only thing persisted, and it never leaves
 * the browser.
 */

const STORAGE_PREFIX = 'dat-tools:wrap:';

/**
 * Loads a tool's saved wrap preference.
 * @param {string} tool - Namespace for the preference, e.g. 'diff-checker'.
 * @param {boolean} [defaultValue] - Returned when nothing has been saved yet, or storage is unavailable.
 * @returns {boolean}
 */
export function loadWrapPreference(tool, defaultValue = true) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + tool);
    if (raw === null) return defaultValue;
    return raw === 'true';
  } catch {
    return defaultValue;
  }
}

/**
 * Saves a tool's wrap preference.
 * @param {string} tool - Namespace for the preference, e.g. 'diff-checker'.
 * @param {boolean} wrap
 */
export function saveWrapPreference(tool, wrap) {
  try {
    localStorage.setItem(STORAGE_PREFIX + tool, String(wrap));
  } catch {
    // localStorage unavailable (private browsing, disabled storage, etc.) - ignore
  }
}
