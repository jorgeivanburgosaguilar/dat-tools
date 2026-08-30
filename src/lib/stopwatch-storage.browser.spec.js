import { describe, it, expect, afterEach, vi } from 'vitest';
import { savePausedSession, loadPausedSession, clearPausedSession } from './stopwatch-storage.js';

const STORAGE_KEY = 'dat-tools:stopwatch:paused-session';

/** @returns {import('./stopwatch-storage.js').PausedSession} */
function makeSession() {
  return {
    elapsedTime: 65000,
    sessionStartTime: 1000,
    laps: [{ id: 1, startTimestamp: 1000, endTimestamp: 30000, elapsedMinutes: 0 }],
    lastLapElapsed: 30000,
    lastLapTimestamp: 30000,
    pausedAt: 66000
  };
}

describe('stopwatch-storage', () => {
  afterEach(() => {
    // Restore mocks first so a test that stubs a throwing localStorage method
    // doesn't make this cleanup call itself throw.
    vi.restoreAllMocks();
    localStorage.removeItem(STORAGE_KEY);
  });

  it('saves a session under the expected storage key', () => {
    savePausedSession(makeSession());
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('round-trips a saved session through loadPausedSession', () => {
    const session = makeSession();
    savePausedSession(session);
    expect(loadPausedSession()).toEqual(session);
  });

  it('clears the saved session', () => {
    savePausedSession(makeSession());
    clearPausedSession();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('returns null when nothing has been saved', () => {
    expect(loadPausedSession()).toBeNull();
  });

  it('returns null instead of throwing when storage holds corrupt JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json');
    expect(loadPausedSession()).toBeNull();
  });

  it('does not throw when localStorage.setItem throws (quota exceeded, private mode, etc.)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => savePausedSession(makeSession())).not.toThrow();
  });

  it('does not throw when localStorage.removeItem throws', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    expect(() => clearPausedSession()).not.toThrow();
  });
});
