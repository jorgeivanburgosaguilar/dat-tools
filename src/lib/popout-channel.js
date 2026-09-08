/**
 * Browser-only half of the pop-out sync feature: the BroadcastChannel wrapper, the window opener,
 * and the coalescing bridge each tool wires up. Kept separate from `popout.js` so the pure
 * envelope/patch logic can be unit-tested under plain Node - see AGENTS.md's dual Vitest project
 * split. Privacy-first, like `wrap-preference.js`: BroadcastChannel only ever reaches other
 * tabs/windows of this same origin, on this same machine - no network traffic, and this app has no
 * server to talk to anyway (adapter-static, fully static build).
 */

import { buildPopoutUrl, makeEnvelope, acceptEnvelope } from './popout.js';

const CHANNEL_PREFIX = 'dat-tools:popout:';
const SESSION_STORAGE_PREFIX = 'dat-tools:popout-session:';

/** How long a `bye`/`owner-bye` waits before treating a window as really gone, giving an F5 time to
 * re-announce itself instead of being mistaken for a close. */
const GRACE_MS = 1500;

/** How often the owner polls a satellite `WindowProxy.closed`, the backstop for a crashed/killed
 * popup where `pagehide` never fires. */
const CLOSED_POLL_MS = 1000;

/**
 * Whether this browser can sync a pop-out at all.
 * @returns {boolean}
 */
export function isPopoutSupported() {
  return typeof BroadcastChannel !== 'undefined';
}

/**
 * Generates a per-window-load id, used to tell windows apart in handshake bookkeeping (not for echo
 * suppression - BroadcastChannel already never delivers a channel's own postMessage back to itself).
 * Exported for `popout-sync.js`, which stamps this into `hello`/`claim`/`bye` payloads itself -
 * `createPopoutBridge` only carries the envelope's `tool`/`session`/`type`, not a `from`.
 * @returns {string}
 */
export function createId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

/**
 * The current owner window's session id: stable across an F5 (kept in `sessionStorage`, which is
 * per-tab), fresh per new tab. Only the *owner* ever calls this - a `window.open`ed satellite
 * inherits a same-origin *copy* of the opener's sessionStorage, not a shared one, so a satellite
 * takes its session from the URL instead (see `readPopoutRequest` in `popout.js`), which is
 * authoritative and survives the satellite's own reload.
 * @param {string} tool
 * @returns {string}
 */
export function ownerSessionId(tool) {
  const key = SESSION_STORAGE_PREFIX + tool;
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
  } catch {
    // sessionStorage unavailable (private browsing, disabled storage) - fall through to an
    // unpersisted id; sync still works within the page lifetime, just not across a reload.
  }
  const id = createId();
  try {
    sessionStorage.setItem(key, id);
  } catch {
    // ignore
  }
  return id;
}

/**
 * Opens (or focuses) the satellite window for a pane. Must be called synchronously from a click
 * handler - awaiting anything first forfeits the user-activation the popup needs and it gets
 * blocked.
 * @param {string} tool - Namespace for the popout, e.g. 'markdown-preview'.
 * @param {string} paneId
 * @param {string} sessionId
 * @returns {Window | null} The satellite window, or null if the browser blocked the popup.
 */
export function openPopoutWindow(tool, paneId, sessionId) {
  try {
    const url = buildPopoutUrl(window.location.href, paneId, sessionId);
    const win = window.open(
      url,
      `dat-tools-popout-${tool}-${paneId}`,
      'popup=yes,width=900,height=800'
    );
    win?.focus();
    return win;
  } catch {
    return null;
  }
}

/**
 * @typedef {Object} PopoutBridgeHandlers
 * @property {(payload: { paneId: string, from: string }) => void} [hello]
 * @property {(payload: { paneId: string, snapshot: * }) => void} [state]
 * @property {(payload: { patch: Record<string, *>, from?: string }) => void} [patch]
 * @property {(payload: { from: string }) => void} [ownerHello]
 * @property {(payload: { paneId: string, from: string, patch: Record<string, *> }) => void} [claim]
 * @property {(payload: { paneId: string, from: string, reason: 'return' | 'unload' }) => void} [bye]
 * @property {(payload: { from: string }) => void} [ownerBye]
 */

/**
 * Creates the sync bridge for one window (owner or satellite) on one tool's channel. Degrades to a
 * harmless no-op object when BroadcastChannel is unavailable, so callers never need to
 * feature-detect themselves.
 * @param {{ tool: string, session: string, from?: string, on?: PopoutBridgeHandlers }} options -
 *   `from` is stamped into every coalesced `patch` message this bridge sends, so the receiving side
 *   can tell which window a patch came from (see `popout-sync.js`'s owner, which uses this to ignore
 *   a patch from a satellite it doesn't currently recognize as popped).
 * @returns {{
 *   send: (patch: Record<string, *>) => void,
 *   post: (type: string, payload?: *) => void,
 *   close: () => void
 * }}
 */
export function createPopoutBridge({ tool, session, from, on = {} }) {
  if (!isPopoutSupported()) {
    return { send() {}, post() {}, close() {} };
  }

  /** @type {BroadcastChannel | null} */
  let channel;
  try {
    channel = new BroadcastChannel(CHANNEL_PREFIX + tool);
  } catch {
    return { send() {}, post() {}, close() {} };
  }

  /** @param {string} type @param {*} [payload] */
  function post(type, payload) {
    try {
      channel?.postMessage(makeEnvelope(tool, session, type, payload));
    } catch (err) {
      // A closed channel throws (harmless, nothing to do) - but so does a payload containing a
      // live Svelte $state proxy rather than plain data (DataCloneError), which is a real caller
      // bug worth surfacing rather than swallowing into a silently-dropped message. See
      // DiffChecker.svelte's `diff`-send effect for the fix: `$state.snapshot(...)` before sending
      // any object (never needed for primitives - strings/numbers/booleans are never proxied).
      if (err instanceof DOMException && err.name === 'DataCloneError') {
        console.error(`popout-channel: dropped a non-cloneable '${type}' message`, err);
      }
    }
  }

  /** @type {Record<string, *> | null} */
  let pendingPatch = null;
  /** @type {number | null} */
  let rafHandle = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timeoutHandle = null;

  function flush() {
    if (rafHandle !== null) cancelAnimationFrame(rafHandle);
    if (timeoutHandle !== null) clearTimeout(timeoutHandle);
    rafHandle = null;
    timeoutHandle = null;
    if (!pendingPatch) return;
    const patch = pendingPatch;
    pendingPatch = null;
    post('patch', { patch, from });
  }

  function scheduleFlush() {
    if (rafHandle !== null || timeoutHandle !== null) return;
    rafHandle = requestAnimationFrame(flush);
    // Backstop: requestAnimationFrame throttles to ~1Hz in an occluded/backgrounded window, which
    // the popped-out window very often is, so a plain timer guarantees delivery regardless.
    timeoutHandle = setTimeout(flush, 50);
  }

  // Cast once so the dynamic `on[type]` lookup below is a plain indexed access instead of an
  // implicit-any error - `PopoutBridgeHandlers` is deliberately typed with named optional
  // properties (better autocomplete/documentation for callers) rather than an index signature.
  const handlers = /** @type {Record<string, ((payload: *) => void) | undefined>} */ (on);

  /** @param {MessageEvent<*>} event */
  const listener = (event) => {
    const message = acceptEnvelope(event.data, { tool, session });
    if (!message) return;
    handlers[toCamelType(message.type)]?.(message.payload);
  };
  channel.addEventListener('message', listener);

  return {
    send(patch) {
      pendingPatch = pendingPatch ? { ...pendingPatch, ...patch } : { ...patch };
      scheduleFlush();
    },
    post,
    close() {
      flush();
      try {
        channel?.removeEventListener('message', listener);
        channel?.close();
      } catch {
        // ignore
      }
    }
  };
}

/**
 * Maps a hyphenated message type ('owner-hello') to the camelCase handler key ('ownerHello') it's
 * dispatched to on the `on` bag.
 * @param {string} type
 * @returns {string}
 */
function toCamelType(type) {
  return type.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Debounces an "the other window went away" signal so a same-window reload isn't mistaken for a
 * real close: `arm()` starts a timer that calls `onExpire` after a short grace window; `cancel()`
 * (called on a following `hello`/`claim`/`owner-hello`) aborts it.
 * @param {() => void} onExpire
 * @returns {{ arm: () => void, cancel: () => void }}
 */
export function createGraceTimer(onExpire) {
  /** @type {ReturnType<typeof setTimeout> | null} */
  let handle = null;
  return {
    arm() {
      if (handle !== null) clearTimeout(handle);
      handle = setTimeout(() => {
        handle = null;
        onExpire();
      }, GRACE_MS);
    },
    cancel() {
      if (handle !== null) clearTimeout(handle);
      handle = null;
    }
  };
}

/**
 * Polls a satellite `WindowProxy` for whether it closed without ever firing `pagehide` (a crash or
 * force-quit). Returns a stop function.
 * @param {Window} win
 * @param {() => void} onClosed
 * @returns {() => void}
 */
export function watchPopoutWindow(win, onClosed) {
  const interval = setInterval(() => {
    if (win.closed) {
      clearInterval(interval);
      onClosed();
    }
  }, CLOSED_POLL_MS);
  return () => clearInterval(interval);
}
