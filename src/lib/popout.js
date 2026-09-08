/**
 * Pure helpers for the "pop out a pane into a separate window" feature: URL/query-param encoding,
 * the cross-window message envelope, and patch application. Kept free of any browser-only API (no
 * BroadcastChannel, no window, no sessionStorage) so it runs under plain Node - see
 * `popout-channel.js` for the browser-only half that actually opens windows and talks over them.
 */

/** Query param naming which pane a satellite window renders. */
export const POPOUT_PARAM = 'popout';

/** Query param pairing a satellite window with its owner tab, so unrelated tabs of the same tool
 * never cross-write each other's content - see `acceptEnvelope`. */
export const SESSION_PARAM = 'session';

export const PROTOCOL_VERSION = 1;

/**
 * Builds the URL for a satellite window rendering a single pane, from the current page's URL. Any
 * pre-existing popout/session params are stripped first, so popping out from an already-popped-out
 * window (not currently possible, but harmless to guard) never nests stale params.
 * @param {string} href - The current page's URL, e.g. `location.href`.
 * @param {string} paneId
 * @param {string} sessionId
 * @returns {string}
 */
export function buildPopoutUrl(href, paneId, sessionId) {
  const url = new URL(href);
  url.searchParams.delete(POPOUT_PARAM);
  url.searchParams.delete(SESSION_PARAM);
  url.searchParams.set(POPOUT_PARAM, paneId);
  url.searchParams.set(SESSION_PARAM, sessionId);
  return url.toString();
}

/**
 * Reads a satellite window's requested pane + session from a URL's query string. Both must be
 * present for the request to be valid - a `popout` param with no `session` is treated as absent
 * rather than guessed at.
 * @param {string} search - e.g. `location.search`.
 * @returns {{ paneId: string, session: string } | null}
 */
export function readPopoutRequest(search) {
  const params = new URLSearchParams(search);
  const paneId = params.get(POPOUT_PARAM);
  const session = params.get(SESSION_PARAM);
  if (!paneId || !session) return null;
  return { paneId, session };
}

/**
 * @typedef {Object} PopoutEnvelope
 * @property {1} v - Protocol version.
 * @property {string} tool - Namespace, e.g. 'markdown-preview'.
 * @property {string} session - Pairs an owner window with its satellite(s); see `SESSION_PARAM`.
 * @property {string} type - 'hello' | 'state' | 'patch' | 'owner-hello' | 'claim' | 'bye' | 'owner-bye'.
 * @property {*} [payload]
 */

/**
 * Builds a message envelope.
 *
 * `payload` is round-tripped through JSON, stripping it down to plain, structured-clone-safe data
 * regardless of what was actually passed in. This matters because `shared` in a tool component is
 * a Svelte `$state` object, and any object/array value read off it (e.g. a computed diff result,
 * a normalized trajectory) is itself a live reactive Proxy - `BroadcastChannel.postMessage` cannot
 * structured-clone one (`DataCloneError`), even though ordinary property access on it (which is
 * all `JSON.stringify` ever does) works exactly like a plain object. Primitives (strings, numbers,
 * booleans) are never proxied and pass through unchanged either way.
 * @param {string} tool
 * @param {string} session
 * @param {string} type
 * @param {*} [payload]
 * @returns {PopoutEnvelope}
 */
export function makeEnvelope(tool, session, type, payload) {
  return {
    v: PROTOCOL_VERSION,
    tool,
    session,
    type,
    payload: payload === undefined ? undefined : JSON.parse(JSON.stringify(payload))
  };
}

/**
 * Validates an incoming envelope against this window's tool + session, rejecting anything from a
 * different tool, a different protocol version, or - crucially - a different, unrelated tab of the
 * same tool. Without the session check, two ordinary browser tabs open on the same tool (no pop-out
 * involved at all) would silently overwrite each other's content, since a BroadcastChannel is
 * scoped only by name.
 * @param {*} message
 * @param {{ tool: string, session: string }} context
 * @returns {PopoutEnvelope | null}
 */
export function acceptEnvelope(message, context) {
  if (!message || typeof message !== 'object') return null;
  if (message.v !== PROTOCOL_VERSION) return null;
  if (message.tool !== context.tool) return null;
  if (message.session !== context.session) return null;
  return message;
}

/**
 * Shallow-merges a patch into a pending, not-yet-sent patch. The latest value for a given key wins,
 * so a burst of writes to the same key (e.g. rapid typing) collapses to one outgoing value.
 * @param {Record<string, *> | null} pending
 * @param {Record<string, *>} patch
 * @returns {Record<string, *>}
 */
export function mergePatch(pending, patch) {
  return { ...pending, ...patch };
}

/**
 * Applies an incoming patch onto a `$state` object, one key at a time, with two safety rules:
 * - Only assigns a key already present on `target`. This is what keeps a `patch` message
 *   untargeted: a window whose synced state has no `original` key (because it's showing a different
 *   pane) simply drops an `original` patch, with no per-pane addressing required.
 * - Skips a key whose incoming value is already `===` the current one, so re-applying a value that
 *   echoed back never reassigns a bound `<textarea>`'s value (which would reset its caret) and never
 *   loops a message back out over the channel.
 * @param {Record<string, *>} target
 * @param {Record<string, *>} patch
 * @returns {boolean} Whether anything was actually assigned.
 */
export function applyPatch(target, patch) {
  let changed = false;
  for (const key of Object.keys(patch)) {
    if (!(key in target)) continue;
    if (target[key] === patch[key]) continue;
    target[key] = patch[key];
    changed = true;
  }
  return changed;
}
