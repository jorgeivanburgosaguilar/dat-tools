import { describe, it, expect } from 'vitest';
import {
  POPOUT_PARAM,
  SESSION_PARAM,
  PROTOCOL_VERSION,
  buildPopoutUrl,
  readPopoutRequest,
  makeEnvelope,
  acceptEnvelope,
  mergePatch,
  applyPatch
} from './popout.js';

describe('popout', () => {
  describe('buildPopoutUrl', () => {
    it('sets the popout and session params', () => {
      const url = buildPopoutUrl('https://example.com/markdown-preview', 'preview', 'sess-1');
      const parsed = new URL(url);
      expect(parsed.searchParams.get(POPOUT_PARAM)).toBe('preview');
      expect(parsed.searchParams.get(SESSION_PARAM)).toBe('sess-1');
    });

    it('preserves the base path', () => {
      const url = buildPopoutUrl('https://example.com/diff-checker', 'original', 'sess-1');
      expect(new URL(url).pathname).toBe('/diff-checker');
    });

    it('strips a pre-existing popout/session pair rather than nesting it', () => {
      const url = buildPopoutUrl(
        'https://example.com/diff-checker?popout=original&session=stale',
        'changed',
        'sess-2'
      );
      const parsed = new URL(url);
      expect(parsed.searchParams.getAll(POPOUT_PARAM)).toEqual(['changed']);
      expect(parsed.searchParams.getAll(SESSION_PARAM)).toEqual(['sess-2']);
    });

    it('preserves unrelated query params', () => {
      const url = buildPopoutUrl('https://example.com/json-validator?foo=bar', 'output', 'sess-1');
      expect(new URL(url).searchParams.get('foo')).toBe('bar');
    });
  });

  describe('readPopoutRequest', () => {
    it('reads paneId and session from a query string', () => {
      expect(readPopoutRequest('?popout=preview&session=sess-1')).toEqual({
        paneId: 'preview',
        session: 'sess-1'
      });
    });

    it('returns null when popout is missing', () => {
      expect(readPopoutRequest('?session=sess-1')).toBeNull();
    });

    it('returns null when session is missing', () => {
      expect(readPopoutRequest('?popout=preview')).toBeNull();
    });

    it('returns null for an empty query string', () => {
      expect(readPopoutRequest('')).toBeNull();
    });
  });

  describe('makeEnvelope / acceptEnvelope', () => {
    it('round-trips a valid envelope', () => {
      const message = makeEnvelope('markdown-preview', 'sess-1', 'hello', { paneId: 'preview' });
      expect(acceptEnvelope(message, { tool: 'markdown-preview', session: 'sess-1' })).toBe(
        message
      );
    });

    it('stamps the current protocol version', () => {
      const message = makeEnvelope('markdown-preview', 'sess-1', 'hello');
      expect(message.v).toBe(PROTOCOL_VERSION);
    });

    it('strips a payload down to a plain JSON-safe clone, unaffected by mutating the original afterward', () => {
      // Stands in for a Svelte $state proxy - postMessage's structured-clone algorithm rejects a
      // Proxy outright even when its own get/has traps make it look exactly like a plain object,
      // so the fix is a JSON round-trip rather than a shallow copy. A Proxy is the most faithful
      // thing to reproduce here without pulling Svelte into this Node-only test file, but the same
      // round-trip is also what protects a plain object from post-call mutation.
      const original = { rows: [{ text: 'a' }] };
      const proxied = new Proxy(original, {});
      const message = makeEnvelope('diff-checker', 'sess-1', 'state', { snapshot: proxied });

      expect(message.payload).toEqual({ snapshot: { rows: [{ text: 'a' }] } });
      expect(message.payload.snapshot).not.toBe(proxied);

      original.rows[0].text = 'mutated';
      expect(message.payload.snapshot.rows[0].text).toBe('a');
    });

    it('leaves an absent payload as undefined rather than crashing on JSON.stringify', () => {
      const message = makeEnvelope('markdown-preview', 'sess-1', 'hello');
      expect(message.payload).toBeUndefined();
    });

    it('rejects a message for a different tool', () => {
      const message = makeEnvelope('json-validator', 'sess-1', 'hello');
      expect(acceptEnvelope(message, { tool: 'markdown-preview', session: 'sess-1' })).toBeNull();
    });

    it('rejects a message from an unrelated tab (different session, same tool)', () => {
      const message = makeEnvelope('markdown-preview', 'sess-other', 'hello');
      expect(acceptEnvelope(message, { tool: 'markdown-preview', session: 'sess-1' })).toBeNull();
    });

    it('rejects a message with a mismatched protocol version', () => {
      const message = { v: 2, tool: 'markdown-preview', session: 'sess-1', type: 'hello' };
      expect(acceptEnvelope(message, { tool: 'markdown-preview', session: 'sess-1' })).toBeNull();
    });

    it('rejects a non-object message instead of throwing', () => {
      expect(acceptEnvelope(null, { tool: 'markdown-preview', session: 'sess-1' })).toBeNull();
      expect(acceptEnvelope(undefined, { tool: 'markdown-preview', session: 'sess-1' })).toBeNull();
      expect(
        acceptEnvelope('not an envelope', { tool: 'markdown-preview', session: 'sess-1' })
      ).toBeNull();
    });
  });

  describe('mergePatch', () => {
    it('merges a patch into null pending, starting a fresh object', () => {
      expect(mergePatch(null, { markdown: 'hi' })).toEqual({ markdown: 'hi' });
    });

    it('lets the latest value for a key win', () => {
      const pending = mergePatch(null, { markdown: 'a' });
      expect(mergePatch(pending, { markdown: 'ab' })).toEqual({ markdown: 'ab' });
    });

    it('keeps unrelated keys from earlier merges', () => {
      const pending = mergePatch(null, { markdown: 'a', cursorLine: 1 });
      expect(mergePatch(pending, { markdown: 'ab' })).toEqual({ markdown: 'ab', cursorLine: 1 });
    });

    it('does not mutate the pending object it was given', () => {
      const pending = { markdown: 'a' };
      mergePatch(pending, { markdown: 'ab' });
      expect(pending).toEqual({ markdown: 'a' });
    });
  });

  describe('applyPatch', () => {
    it('assigns a changed key that already exists on the target', () => {
      const target = { markdown: 'a', cursorLine: 1 };
      const changed = applyPatch(target, { markdown: 'ab' });
      expect(target.markdown).toBe('ab');
      expect(changed).toBe(true);
    });

    it('ignores a key absent from the target (untargeted-patch guarantee)', () => {
      const target = { changed: 'x' };
      const changed = applyPatch(target, { original: 'y' });
      expect(target).toEqual({ changed: 'x' });
      expect('original' in target).toBe(false);
      expect(changed).toBe(false);
    });

    it('does not reassign a key whose incoming value is already ===', () => {
      const value = 'same';
      const target = { markdown: value };
      // A setter would let us prove no assignment happened; comparing identity is enough here since
      // strings are primitives - the behavioral contract under test is the returned `changed` flag.
      const changed = applyPatch(target, { markdown: value });
      expect(changed).toBe(false);
      expect(target.markdown).toBe(value);
    });

    it('detects a no-op patch on an object target via reference equality', () => {
      const shared = { rows: [1, 2, 3] };
      const target = { rows: shared.rows };
      const changed = applyPatch(target, { rows: shared.rows });
      expect(changed).toBe(false);
    });

    it('reports changed=true only when at least one key was actually assigned', () => {
      const target = { markdown: 'a' };
      expect(applyPatch(target, { markdown: 'a', unknownKey: 'z' })).toBe(false);
      expect(applyPatch(target, { markdown: 'b', unknownKey: 'z' })).toBe(true);
    });

    it('applies multiple keys in one call', () => {
      const target = { markdown: 'a', cursorLine: 1, lineHeightPx: 0 };
      applyPatch(target, { markdown: 'ab', cursorLine: 2, lineHeightPx: 20 });
      expect(target).toEqual({ markdown: 'ab', cursorLine: 2, lineHeightPx: 20 });
    });
  });
});
