/**
 * localStorage persistence for a paused stopwatch session.
 * Privacy-first: state never leaves the browser, and is only ever written
 * when the user pauses. Starting fresh, lapping, or stopping never persists
 * here - stopping explicitly clears it since a stopped session is final.
 */

const STORAGE_KEY = 'dat-tools:stopwatch:paused-session';

/**
 * @typedef {Object} PausedSessionLap
 * @property {number} id - Sequential lap number
 * @property {number} startTimestamp - Wall-clock start of the lap segment
 * @property {number} endTimestamp - Wall-clock end of the lap segment
 * @property {number} elapsedMinutes - Lap duration in whole minutes
 */

/**
 * @typedef {Object} PausedSession
 * @property {number} elapsedTime - Elapsed time in milliseconds at the moment of pause
 * @property {number} sessionStartTime - Timestamp when the current session started
 * @property {PausedSessionLap[]} laps - Recorded laps for the current session
 * @property {number} lastLapElapsed - Elapsed time at the last recorded lap
 * @property {number} lastLapTimestamp - Wall-clock timestamp of the last recorded lap
 * @property {number} pausedAt - Wall-clock timestamp when the pause happened
 */

/**
 * Saves the current paused session so it can be restored on the next visit.
 * @param {PausedSession} session
 */
export function savePausedSession(session) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // localStorage unavailable (private browsing, disabled storage, etc.) - ignore
  }
}

/**
 * Loads a previously saved paused session, if one exists.
 * @returns {PausedSession | null}
 */
export function loadPausedSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Clears the saved paused session. Called when the user stops the stopwatch,
 * since stopping is final and nothing should be resumed afterwards.
 */
export function clearPausedSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
