import { describe, it, expect, afterEach, vi } from 'vitest';
import { createPopoutSync } from './popout-sync.js';
import { ownerSessionId, createPopoutBridge } from './popout-channel.js';

const TOOL = 'popout-sync-test';
const SESSION_KEY = `dat-tools:popout-session:${TOOL}`;

/** @param {string} search */
function setSearch(search) {
  const url = new URL(location.href);
  url.search = search;
  history.replaceState(null, '', url.toString());
}

describe('popout-sync', () => {
  afterEach(() => {
    setSearch('');
    sessionStorage.removeItem(SESSION_KEY);
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('acts as the owner when the URL has no popout request', () => {
    const sync = createPopoutSync({ tool: TOOL, shared: { markdown: '' } });
    expect(sync.isSatelliteRequest).toBe(false);
    expect(sync.requestedPaneId).toBeNull();
    sync.destroy();
  });

  it('acts as a satellite when the URL has a valid popout+session pair', () => {
    setSearch('?popout=preview&session=sess-1');
    const sync = createPopoutSync({ tool: TOOL, shared: { markdown: '' } });
    expect(sync.isSatelliteRequest).toBe(true);
    expect(sync.requestedPaneId).toBe('preview');
    sync.destroy();
  });

  it('acts as the owner when popout is present but session is missing', () => {
    setSearch('?popout=preview');
    const sync = createPopoutSync({ tool: TOOL, shared: { markdown: '' } });
    expect(sync.isSatelliteRequest).toBe(false);
    sync.destroy();
  });

  describe('handshake', () => {
    it('a satellite receives the owner snapshot, becomes connected, and fires onSatelliteReady', async () => {
      const ownerShared = { markdown: 'hello world', cursorLine: 3 };
      const owner = createPopoutSync({ tool: TOOL, shared: ownerShared });

      const session = ownerSessionId(TOOL);
      setSearch(`?popout=preview&session=${session}`);
      const satShared = { markdown: '', cursorLine: 1 };
      /** @type {string[]} */
      const ready = [];
      /** @type {boolean[]} */
      const connectionChanges = [];
      const satellite = createPopoutSync({
        tool: TOOL,
        shared: satShared,
        callbacks: {
          onSatelliteReady: (id) => ready.push(id),
          onConnectionChange: (c) => connectionChanges.push(c)
        }
      });

      await expect.poll(() => satShared.markdown).toBe('hello world');
      expect(satShared.cursorLine).toBe(3);
      expect(ready).toEqual(['preview']);
      expect(connectionChanges).toEqual([true]);

      owner.destroy();
      satellite.destroy();
    });

    it('the owner only reports a pane as popped after hello, not merely after requestPopout', async () => {
      vi.spyOn(window, 'open').mockReturnValue(/** @type {any} */ ({ focus() {}, closed: false }));
      /** @type {string[][]} */
      const poppedSnapshots = [];
      const owner = createPopoutSync({
        tool: TOOL,
        shared: { markdown: '' },
        callbacks: { onOwnerPoppedChange: (ids) => poppedSnapshots.push(ids) }
      });

      owner.requestPopout('preview');
      // requestPopout alone (no satellite has actually mounted/hello'd yet) must not have reported
      // anything popped.
      expect(poppedSnapshots).toEqual([]);

      const session = ownerSessionId(TOOL);
      setSearch(`?popout=preview&session=${session}`);
      const satellite = createPopoutSync({ tool: TOOL, shared: { markdown: '' } });

      await expect.poll(() => poppedSnapshots.at(-1)).toEqual(['preview']);

      owner.destroy();
      satellite.destroy();
    });
  });

  describe('bidirectional patches', () => {
    it('delivers an owner patch to a connected satellite', async () => {
      const ownerShared = { markdown: 'a' };
      const owner = createPopoutSync({ tool: TOOL, shared: ownerShared });

      const session = ownerSessionId(TOOL);
      setSearch(`?popout=preview&session=${session}`);
      const satShared = { markdown: '' };
      const satellite = createPopoutSync({ tool: TOOL, shared: satShared });
      await expect.poll(() => satShared.markdown).toBe('a');

      owner.send({ markdown: 'ab' });
      await expect.poll(() => satShared.markdown).toBe('ab');

      owner.destroy();
      satellite.destroy();
    });

    it('delivers a satellite patch to the owner', async () => {
      const ownerShared = { markdown: 'a' };
      const owner = createPopoutSync({ tool: TOOL, shared: ownerShared });

      const session = ownerSessionId(TOOL);
      setSearch(`?popout=preview&session=${session}`);
      const satShared = { markdown: '' };
      const satellite = createPopoutSync({ tool: TOOL, shared: satShared });
      await expect.poll(() => satShared.markdown).toBe('a');

      satellite.send({ markdown: 'typed in the popup' });
      await expect.poll(() => ownerShared.markdown).toBe('typed in the popup');

      owner.destroy();
      satellite.destroy();
    });

    it('ignores a patch from a sender the owner does not currently recognize as popped', async () => {
      const ownerShared = { markdown: 'a' };
      const owner = createPopoutSync({ tool: TOOL, shared: ownerShared });

      // A raw bridge on the same tool+session, posing as a satellite that never said `hello` (e.g.
      // a stale/superseded window) - the owner must not apply its patch.
      const impostor = createPopoutBridge({ tool: TOOL, session: ownerSessionId(TOOL), from: 'x' });
      impostor.send({ markdown: 'from an unknown sender' });

      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(ownerShared.markdown).toBe('a');

      owner.destroy();
      impostor.close();
    });
  });

  describe('requestPopout', () => {
    it('reports popup blocked instead of tracking a popped pane', () => {
      vi.spyOn(window, 'open').mockReturnValue(null);
      const onPopoutBlocked = vi.fn();
      const onOwnerPoppedChange = vi.fn();
      const owner = createPopoutSync({
        tool: TOOL,
        shared: { markdown: '' },
        callbacks: { onPopoutBlocked, onOwnerPoppedChange }
      });

      owner.requestPopout('preview');

      expect(onPopoutBlocked).toHaveBeenCalledOnce();
      expect(onOwnerPoppedChange).not.toHaveBeenCalled();
      owner.destroy();
    });

    it('focuses an already-open satellite instead of opening a second one', async () => {
      const focus = vi.fn();
      const openSpy = vi
        .spyOn(window, 'open')
        .mockReturnValue(/** @type {any} */ ({ focus, closed: false }));
      const owner = createPopoutSync({ tool: TOOL, shared: { markdown: '' } });

      owner.requestPopout('preview');
      owner.requestPopout('preview');

      expect(openSpy).toHaveBeenCalledTimes(1);
      expect(focus).toHaveBeenCalledTimes(2);
      owner.destroy();
    });
  });

  describe('returnHome', () => {
    it('restores the pane on the owner and reports it no longer popped', async () => {
      /** @type {string[][]} */
      const poppedSnapshots = [];
      const owner = createPopoutSync({
        tool: TOOL,
        shared: { markdown: '' },
        callbacks: { onOwnerPoppedChange: (ids) => poppedSnapshots.push(ids) }
      });
      const session = ownerSessionId(TOOL);

      setSearch(`?popout=preview&session=${session}`);
      const satellite = createPopoutSync({ tool: TOOL, shared: { markdown: '' } });
      await expect.poll(() => poppedSnapshots.at(-1)).toEqual(['preview']);

      satellite.returnHome();
      await expect.poll(() => poppedSnapshots.at(-1)).toEqual([]);

      owner.destroy();
      satellite.destroy();
    });
  });

  describe('grace window (F5 vs. a real close)', () => {
    it('an F5 (bye unload followed by a fresh hello) does not restore the pane', async () => {
      /** @type {string[][]} */
      const poppedSnapshots = [];
      const owner = createPopoutSync({
        tool: TOOL,
        shared: { markdown: '' },
        callbacks: { onOwnerPoppedChange: (ids) => poppedSnapshots.push(ids) }
      });
      const session = ownerSessionId(TOOL);

      setSearch(`?popout=preview&session=${session}`);
      let satellite = createPopoutSync({ tool: TOOL, shared: { markdown: '' } });
      await expect.poll(() => poppedSnapshots.at(-1)).toEqual(['preview']);

      // Simulate the reload: the old window unloads (its pagehide listener posts bye/unload)...
      window.dispatchEvent(new Event('pagehide'));
      satellite.destroy();
      // ...then a brand new page load posts hello again shortly after, before the grace window
      // (1.5s) expires.
      satellite = createPopoutSync({ tool: TOOL, shared: { markdown: '' } });

      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(poppedSnapshots.at(-1)).toEqual(['preview']);

      owner.destroy();
      satellite.destroy();
    });

    it('a real close (bye unload with no following hello) restores the pane after the grace window', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      /** @type {string[][]} */
      const poppedSnapshots = [];
      const owner = createPopoutSync({
        tool: TOOL,
        shared: { markdown: '' },
        callbacks: { onOwnerPoppedChange: (ids) => poppedSnapshots.push(ids) }
      });
      const session = ownerSessionId(TOOL);

      setSearch(`?popout=preview&session=${session}`);
      const satellite = createPopoutSync({ tool: TOOL, shared: { markdown: '' } });

      // The handshake itself resolves over a real BroadcastChannel post, which fake timers don't
      // affect - but polling for it needs its own real-timer window, so flip timers back briefly.
      vi.useRealTimers();
      await expect.poll(() => poppedSnapshots.at(-1)).toEqual(['preview']);
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

      window.dispatchEvent(new Event('pagehide'));
      satellite.destroy();

      await vi.advanceTimersByTimeAsync(1600);
      expect(poppedSnapshots.at(-1)).toEqual([]);

      owner.destroy();
    });
  });
});
