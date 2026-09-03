import { describe, it, expect, afterEach, vi } from 'vitest';
import { loadWrapPreference, saveWrapPreference } from './wrap-preference.js';

const KEY = 'dat-tools:wrap:diff-checker';

describe('wrap-preference', () => {
  afterEach(() => {
    // Restore mocks first so a test that stubs a throwing localStorage method
    // doesn't make this cleanup call itself throw.
    vi.restoreAllMocks();
    localStorage.removeItem(KEY);
  });

  it('saves the preference under a namespaced storage key', () => {
    saveWrapPreference('diff-checker', false);
    expect(localStorage.getItem(KEY)).toBe('false');
  });

  it('round-trips a saved preference through loadWrapPreference', () => {
    saveWrapPreference('diff-checker', false);
    expect(loadWrapPreference('diff-checker')).toBe(false);
    saveWrapPreference('diff-checker', true);
    expect(loadWrapPreference('diff-checker')).toBe(true);
  });

  it('returns the default when nothing has been saved for that tool', () => {
    expect(loadWrapPreference('diff-checker')).toBe(true);
    expect(loadWrapPreference('diff-checker', false)).toBe(false);
  });

  it('keeps preferences for different tools independent', () => {
    saveWrapPreference('diff-checker', false);
    expect(loadWrapPreference('json-validator')).toBe(true);
    localStorage.removeItem('dat-tools:wrap:json-validator');
  });

  it('returns the default instead of throwing when localStorage.getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    expect(loadWrapPreference('diff-checker', false)).toBe(false);
  });

  it('does not throw when localStorage.setItem throws (quota exceeded, private mode, etc.)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => saveWrapPreference('diff-checker', true)).not.toThrow();
  });
});
