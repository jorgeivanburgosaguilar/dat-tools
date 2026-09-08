/**
 * Wires the full pop-out sync lifecycle (owner or satellite, decided from the current URL) for one
 * tool, composing the primitives in `popout-channel.js`. This module owns no reactive state of its
 * own - it mutates the caller's own `shared` object in place via `applyPatch`, and reports every
 * status change through `callbacks`, which the caller stores into its own `$state`. That split
 * matters: a `.svelte.js` singleton holding its *own* `$state` copy of `shared` would create a
 * second source of truth alongside the tool component's, manufacturing exactly the two-writer bug
 * this design otherwise avoids (see AGENTS.md - "components own their internal state").
 *
 * Call `createPopoutSync` once, from `onMount` (never during initial render - the URL must not
 * influence what the very first client render produces, or it desyncs from the prerendered HTML
 * and desyncs Svelte's hydration). Call the returned `destroy()` from `onMount`'s cleanup function.
 */

import { readPopoutRequest, applyPatch } from './popout.js';
import {
  createId,
  ownerSessionId,
  openPopoutWindow,
  createPopoutBridge,
  createGraceTimer,
  watchPopoutWindow
} from './popout-channel.js';

/**
 * @typedef {Object} PopoutSyncCallbacks
 * @property {(paneId: string) => void} [onSatelliteReady] - Satellite only: the owner's initial
 *   snapshot arrived. This - not merely the URL asking for it - is what should flip a tool's UI
 *   into satellite mode, so a satellite opened directly with no owner just stays a normal full tool
 *   instead of getting stuck showing one empty pane forever.
 * @property {(connected: boolean) => void} [onConnectionChange] - Satellite only: whether the owner
 *   is currently reachable.
 * @property {(poppedIds: string[]) => void} [onOwnerPoppedChange] - Owner only: which panes are
 *   currently popped out (a confirmed `hello` was received for them, not merely requested).
 * @property {() => void} [onPopoutBlocked] - Owner only: the browser blocked `window.open`.
 */

/**
 * @typedef {Object} PopoutSyncHandle
 * @property {boolean} isSatelliteRequest - Whether this page load's URL asked to be a satellite.
 *   UI branching (what to render) should still use `onSatelliteReady`, not this - but a "do I
 *   currently own this key" computation MUST consult `isSatelliteRequest`, not just `isSatellite`:
 *   while a satellite's handshake is still pending, `isSatellite` is still false, and naively
 *   falling through to the owner's "am I NOT missing this pane" check reads state (like an owner's
 *   `poppedIds`) that was never populated on a satellite in the first place, and can wrongly
 *   evaluate to "I own this" - which sends the satellite's still-default `shared` back out and
 *   clobbers the real snapshot moments before it arrives. Store `isSatelliteRequest` into your own
 *   `$state` as soon as this handle exists (it needs no handshake) and gate ownership on it.
 * @property {string | null} requestedPaneId - The pane id from the URL, if this is a satellite request.
 * @property {(paneId: string) => void} requestPopout - Owner only: open or focus the satellite
 *   window for a pane. No-op on a satellite.
 * @property {() => void} returnHome - Satellite only: tell the owner to restore the pane, then
 *   close this window. No-op on the owner.
 * @property {(patch: Record<string, *>) => void} send - Send an update for the keys I currently own.
 * @property {() => void} destroy
 */

/**
 * @param {{ tool: string, shared: Record<string, *>, callbacks?: PopoutSyncCallbacks }} options
 * @returns {PopoutSyncHandle}
 */
export function createPopoutSync({ tool, shared, callbacks = {} }) {
  const search = typeof location !== 'undefined' ? location.search : '';
  const request = readPopoutRequest(search);
  return request
    ? createSatelliteSync({
        tool,
        shared,
        session: request.session,
        paneId: request.paneId,
        callbacks
      })
    : createOwnerSync({ tool, shared, callbacks });
}

/**
 * @param {{ tool: string, shared: Record<string, *>, session: string, paneId: string, callbacks: PopoutSyncCallbacks }} options
 * @returns {PopoutSyncHandle}
 */
function createSatelliteSync({ tool, shared, session, paneId, callbacks }) {
  const from = createId();

  // A satellite never calls ownerSessionId - it takes its session from the URL, which is
  // authoritative and survives its own reload (see popout-channel.js's ownerSessionId doc).
  const ownerGrace = createGraceTimer(() => callbacks.onConnectionChange?.(false));

  const bridge = createPopoutBridge({
    tool,
    session,
    from,
    on: {
      state(payload) {
        if (payload.paneId !== paneId) return;
        applyPatch(shared, payload.snapshot);
        ownerGrace.cancel();
        callbacks.onConnectionChange?.(true);
        callbacks.onSatelliteReady?.(paneId);
      },
      patch({ patch }) {
        applyPatch(shared, patch);
      },
      ownerHello() {
        // The owner (re)loaded and is asking who's still out here - answer with our current
        // values so an owner reload can never clobber what the user typed into this window.
        bridge.post('claim', { paneId, from, patch: { ...shared } });
      },
      ownerBye() {
        ownerGrace.arm();
      }
    }
  });

  bridge.post('hello', { paneId, from });

  function onPageHide() {
    bridge.post('bye', { paneId, from, reason: 'unload' });
  }
  if (typeof window !== 'undefined') window.addEventListener('pagehide', onPageHide);

  return {
    isSatelliteRequest: true,
    requestedPaneId: paneId,
    requestPopout() {},
    returnHome() {
      bridge.post('bye', { paneId, from, reason: 'return' });
      try {
        window.close();
      } catch {
        // window.close() silently no-ops on a window this script didn't open, or is unavailable -
        // either way there's nothing more to do here.
      }
    },
    send(patch) {
      bridge.send(patch);
    },
    destroy() {
      if (typeof window !== 'undefined') window.removeEventListener('pagehide', onPageHide);
      bridge.close();
    }
  };
}

/**
 * @param {{ tool: string, shared: Record<string, *>, callbacks: PopoutSyncCallbacks }} options
 * @returns {PopoutSyncHandle}
 */
function createOwnerSync({ tool, shared, callbacks }) {
  const session = ownerSessionId(tool);
  const from = createId();

  /**
   * One entry per pane a satellite has confirmed (`hello`'d) or is pending confirmation for.
   * `from` is '' until a `hello` for that pane actually arrives - `requestPopout` seeds a
   * placeholder immediately so a second click on the same pane focuses the existing window instead
   * of opening a duplicate, but `onOwnerPoppedChange` is only ever fired from the `hello` handler,
   * so the layout doesn't collapse a pane until a satellite has actually confirmed it mounted.
   * @type {Map<string, { from: string, win: Window | null, stopWatching: (() => void) | null, grace: ReturnType<typeof createGraceTimer> }>}
   */
  const popped = new Map();

  function reportPopped() {
    callbacks.onOwnerPoppedChange?.(Array.from(popped.keys()));
  }

  /** @param {string} paneId */
  function restorePane(paneId) {
    popped.get(paneId)?.stopWatching?.();
    popped.delete(paneId);
    reportPopped();
  }

  const bridge = createPopoutBridge({
    tool,
    session,
    from,
    on: {
      hello(payload) {
        const existing = popped.get(payload.paneId);
        existing?.grace.cancel();
        popped.set(payload.paneId, {
          from: payload.from,
          win: existing?.win ?? null,
          stopWatching: existing?.stopWatching ?? null,
          grace: existing?.grace ?? createGraceTimer(() => restorePane(payload.paneId))
        });
        reportPopped();
        bridge.post('state', { paneId: payload.paneId, snapshot: { ...shared } });
      },
      claim(payload) {
        const entry = popped.get(payload.paneId);
        if (!entry || entry.from !== payload.from) return;
        applyPatch(shared, payload.patch);
        entry.grace.cancel();
        bridge.post('state', { paneId: payload.paneId, snapshot: { ...shared } });
      },
      patch({ patch, from: senderFrom }) {
        // Only accept a patch from a satellite this owner currently recognizes as popped (i.e. it
        // hello'd/claimed and hasn't since gone away) - guards against a stale/superseded satellite
        // and, in tests, against two unrelated owner instances that happen to share a channel.
        const known = Array.from(popped.values()).some((entry) => entry.from === senderFrom);
        if (!known) return;
        applyPatch(shared, patch);
      },
      bye(payload) {
        const entry = popped.get(payload.paneId);
        if (!entry || entry.from !== payload.from) return;
        if (payload.reason === 'return') {
          restorePane(payload.paneId);
        } else {
          // 'unload' - could be a real close, or the first half of an F5. Give the grace window a
          // chance to be cancelled by the following `hello` before treating it as a real close.
          entry.grace.arm();
        }
      }
    }
  });

  // Announce our own (re)load so any satellite that's still alive re-announces via `claim` -
  // otherwise an owner reload would silently forget every popped pane it had.
  bridge.post('owner-hello', { from: createId() });

  return {
    isSatelliteRequest: false,
    requestedPaneId: null,
    requestPopout(paneId) {
      const existing = popped.get(paneId);
      if (existing) {
        existing.win?.focus();
        return;
      }
      const win = openPopoutWindow(tool, paneId, session);
      if (!win) {
        callbacks.onPopoutBlocked?.();
        return;
      }
      const grace = createGraceTimer(() => restorePane(paneId));
      const stopWatching = watchPopoutWindow(win, () => grace.arm());
      popped.set(paneId, { from: '', win, stopWatching, grace });
    },
    returnHome() {},
    send(patch) {
      bridge.send(patch);
    },
    destroy() {
      for (const entry of popped.values()) entry.stopWatching?.();
      bridge.close();
    }
  };
}
