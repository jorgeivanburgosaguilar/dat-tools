import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  isPopoutSupported,
  ownerSessionId,
  openPopoutWindow,
  createPopoutBridge,
  createGraceTimer,
  watchPopoutWindow
} from './popout-channel.js';

const SESSION_KEY = 'dat-tools:popout-session:markdown-preview';

describe('popout-channel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.removeItem(SESSION_KEY);
  });

  it('reports BroadcastChannel support in this environment', () => {
    expect(isPopoutSupported()).toBe(true);
  });

  describe('ownerSessionId', () => {
    it('persists the id under a namespaced sessionStorage key', () => {
      const id = ownerSessionId('markdown-preview');
      expect(sessionStorage.getItem(SESSION_KEY)).toBe(id);
    });

    it('returns the same id on repeated calls (survives a reload within the tab)', () => {
      const first = ownerSessionId('markdown-preview');
      const second = ownerSessionId('markdown-preview');
      expect(second).toBe(first);
    });

    it('keeps different tools on independent session ids', () => {
      const markdown = ownerSessionId('markdown-preview');
      const json = ownerSessionId('json-validator');
      expect(markdown).not.toBe(json);
      sessionStorage.removeItem('dat-tools:popout-session:json-validator');
    });

    it('still returns an id when sessionStorage.getItem throws', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('storage disabled');
      });
      expect(() => ownerSessionId('markdown-preview')).not.toThrow();
      expect(typeof ownerSessionId('markdown-preview')).toBe('string');
    });
  });

  describe('openPopoutWindow', () => {
    it('opens the popout URL with a deterministic window name', () => {
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(/** @type {any} */ ({ focus() {} }));
      openPopoutWindow('markdown-preview', 'preview', 'sess-1');

      expect(openSpy).toHaveBeenCalledTimes(1);
      const [url, name] = openSpy.mock.calls[0];
      expect(String(url)).toContain('popout=preview');
      expect(String(url)).toContain('session=sess-1');
      expect(name).toBe('dat-tools-popout-markdown-preview-preview');
    });

    it('focuses an already-open window with the same name', () => {
      const focus = vi.fn();
      vi.spyOn(window, 'open').mockReturnValue(/** @type {any} */ ({ focus }));
      openPopoutWindow('markdown-preview', 'preview', 'sess-1');
      expect(focus).toHaveBeenCalled();
    });

    it('returns null when the popup is blocked', () => {
      vi.spyOn(window, 'open').mockReturnValue(null);
      expect(openPopoutWindow('markdown-preview', 'preview', 'sess-1')).toBeNull();
    });

    it('returns null instead of throwing when window.open throws', () => {
      vi.spyOn(window, 'open').mockImplementation(() => {
        throw new Error('blocked');
      });
      expect(openPopoutWindow('markdown-preview', 'preview', 'sess-1')).toBeNull();
    });
  });

  describe('createPopoutBridge', () => {
    it('delivers a handshake round trip between two bridges on the same tool+session', async () => {
      const owner = createPopoutBridge({ tool: 'markdown-preview', session: 'sess-1' });
      /** @type {{ paneId: string, snapshot: * } | undefined} */
      let received;
      const satellite = createPopoutBridge({
        tool: 'markdown-preview',
        session: 'sess-1',
        on: {
          state(payload) {
            received = payload;
          }
        }
      });

      owner.post('state', { paneId: 'preview', snapshot: { markdown: 'hi' } });

      await expect
        .poll(() => received)
        .toEqual({ paneId: 'preview', snapshot: { markdown: 'hi' } });

      owner.close();
      satellite.close();
    });

    it('coalesces multiple send() calls in the same tick into one patch message', async () => {
      const owner = createPopoutBridge({ tool: 'markdown-preview', session: 'sess-1' });
      /** @type {Record<string, unknown>[]} */
      const patches = [];
      const satellite = createPopoutBridge({
        tool: 'markdown-preview',
        session: 'sess-1',
        on: {
          patch({ patch }) {
            patches.push(patch);
          }
        }
      });

      owner.send({ markdown: 'a' });
      owner.send({ markdown: 'ab' });
      owner.send({ cursorLine: 2 });

      await expect.poll(() => patches.length).toBe(1);
      expect(patches[0]).toEqual({ markdown: 'ab', cursorLine: 2 });

      owner.close();
      satellite.close();
    });

    it('stamps the bridge-level `from` id into every coalesced patch message', async () => {
      const sender = createPopoutBridge({
        tool: 'markdown-preview',
        session: 'sess-1',
        from: 'sender-1'
      });
      /** @type {{ patch: Record<string, unknown>, from?: string }[]} */
      const received = [];
      const listener = createPopoutBridge({
        tool: 'markdown-preview',
        session: 'sess-1',
        on: {
          patch(payload) {
            received.push(payload);
          }
        }
      });

      sender.send({ markdown: 'a' });

      await expect.poll(() => received.length).toBe(1);
      expect(received[0]).toEqual({ patch: { markdown: 'a' }, from: 'sender-1' });

      sender.close();
      listener.close();
    });

    it('does not deliver messages between mismatched sessions', async () => {
      const a = createPopoutBridge({ tool: 'markdown-preview', session: 'sess-1' });
      const handler = vi.fn();
      const b = createPopoutBridge({
        tool: 'markdown-preview',
        session: 'sess-2',
        on: { hello: handler }
      });

      a.post('hello', { paneId: 'preview', from: 'x' });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(handler).not.toHaveBeenCalled();
      a.close();
      b.close();
    });

    it('does not deliver messages between different tools', async () => {
      const markdown = createPopoutBridge({ tool: 'markdown-preview', session: 'sess-1' });
      const handler = vi.fn();
      const json = createPopoutBridge({
        tool: 'json-validator',
        session: 'sess-1',
        on: { hello: handler }
      });

      markdown.post('hello', { paneId: 'preview', from: 'x' });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(handler).not.toHaveBeenCalled();
      markdown.close();
      json.close();
    });

    it('stops delivering after close', async () => {
      const a = createPopoutBridge({ tool: 'markdown-preview', session: 'sess-1' });
      const handler = vi.fn();
      const b = createPopoutBridge({
        tool: 'markdown-preview',
        session: 'sess-1',
        on: { hello: handler }
      });
      b.close();

      a.post('hello', { paneId: 'preview', from: 'x' });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(handler).not.toHaveBeenCalled();
      a.close();
    });

    it('does not throw when BroadcastChannel is unavailable, and send/post are harmless no-ops', () => {
      const original = globalThis.BroadcastChannel;
      // @ts-expect-error - simulating an unsupported browser
      globalThis.BroadcastChannel = undefined;

      const bridge = createPopoutBridge({ tool: 'markdown-preview', session: 'sess-1' });
      expect(() => bridge.send({ markdown: 'hi' })).not.toThrow();
      expect(() => bridge.post('hello', { paneId: 'preview' })).not.toThrow();
      expect(() => bridge.close()).not.toThrow();

      globalThis.BroadcastChannel = original;
    });
  });

  // Both timers below are plain setTimeout/setInterval, not component-owned effects, but they're
  // still driven purely by elapsed time - fake timers avoid ~8s of real waiting across these cases,
  // per the project's "no real sleeps for timer-driven waits" convention (see AGENTS.md).
  describe('createGraceTimer', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('calls onExpire after the grace window when not cancelled', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const onExpire = vi.fn();
      const timer = createGraceTimer(onExpire);
      timer.arm();

      await vi.advanceTimersByTimeAsync(1600);
      expect(onExpire).toHaveBeenCalledOnce();
    });

    it('does not call onExpire when cancelled first', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const onExpire = vi.fn();
      const timer = createGraceTimer(onExpire);
      timer.arm();
      timer.cancel();

      await vi.advanceTimersByTimeAsync(1600);
      expect(onExpire).not.toHaveBeenCalled();
    });

    it('re-arming resets the timer instead of stacking calls', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const onExpire = vi.fn();
      const timer = createGraceTimer(onExpire);
      timer.arm();
      timer.arm();

      await vi.advanceTimersByTimeAsync(1600);
      expect(onExpire).toHaveBeenCalledOnce();
    });
  });

  describe('watchPopoutWindow', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('calls onClosed once the watched window reports closed', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      const win = /** @type {Window} */ (/** @type {unknown} */ ({ closed: false }));
      const onClosed = vi.fn();
      watchPopoutWindow(win, onClosed);

      /** @type {{ closed: boolean }} */ (win).closed = true;
      await vi.advanceTimersByTimeAsync(1100);

      expect(onClosed).toHaveBeenCalledOnce();
    });

    it('stops polling once stopped', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      const win = /** @type {Window} */ (/** @type {unknown} */ ({ closed: false }));
      const onClosed = vi.fn();
      const stop = watchPopoutWindow(win, onClosed);
      stop();

      /** @type {{ closed: boolean }} */ (win).closed = true;
      await vi.advanceTimersByTimeAsync(1100);

      expect(onClosed).not.toHaveBeenCalled();
    });
  });
});
