/**
 * Converts a chat-messages trajectory - an OpenAI-style `messages` array of `system` / `user` /
 * `assistant` / `tool` turns, as written by some agent harnesses in place of a steps array - into
 * the steps-shaped trajectory object `normalizeTrajectory()` consumes.
 *
 * Grouping: every non-`tool` message becomes one step. A `tool` message is folded into the
 * observation of the assistant step whose `tool_calls` carries its `tool_call_id` (falling back to
 * the closest preceding assistant step), mirroring how a steps-shaped trajectory keeps a turn's
 * calls and their results together. A `tool` message with no assistant step before it becomes a
 * step of its own so nothing is dropped.
 *
 * Pure and DOM-free - safe to import from either Vitest project.
 */

// Assistant-message keys that are either mapped explicitly or pure duplicates of data mapped
// elsewhere (`provider_specific_fields` / `thinking_blocks` repeat `reasoning_content`, `extra`
// repeats the whole message inside `extra.response`). The untouched original message is still
// available in the step's Raw JSON view.
const HANDLED_MESSAGE_KEYS = new Set([
  'role',
  'content',
  'reasoning_content',
  'thinking_blocks',
  'provider_specific_fields',
  'tool_calls',
  'function_call',
  'tool_call_id',
  'extra'
]);

// Top-level keys handled explicitly; everything else is passed through for `collectMetadata()`.
const HANDLED_TOP_KEYS = new Set(['messages', 'info', 'trajectory_format']);

/**
 * @typedef {Object} MessagesConversion
 * @property {Record<string, unknown>} trajectory - Steps-shaped trajectory object.
 * @property {unknown[]} rawSteps - The original message each step was built from (or the array of
 *   messages, when tool results were folded into it), in step order, for the Raw JSON view.
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isMessage(value) {
  return isObject(value) && typeof value.role === 'string';
}

/**
 * Finds the messages array: `{ messages: [...] }`, the same nested under `trajectory`, or a bare
 * array whose every item is a `{ role }` message (a bare array of steps has no `role`).
 * @param {unknown} data
 * @returns {{ messages: Record<string, unknown>[], container: Record<string, unknown> | null } | null}
 */
function resolveMessages(data) {
  if (Array.isArray(data)) {
    return data.length > 0 && data.every(isMessage)
      ? { messages: /** @type {Record<string, unknown>[]} */ (data), container: null }
      : null;
  }
  if (!isObject(data)) return null;
  if (Array.isArray(data.messages) && data.messages.some(isMessage)) {
    return {
      messages: /** @type {Record<string, unknown>[]} */ (data.messages.filter(isMessage)),
      container: data
    };
  }
  if (isObject(data.trajectory)) return resolveMessages(data.trajectory);
  return null;
}

/**
 * Flattens message content: a plain string, or an array of content parts where text parts are
 * joined and any other part is kept as pretty-printed JSON.
 * @param {unknown} content
 * @returns {string}
 */
export function messageText(content) {
  if (content === null || content === undefined) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        isObject(part) && typeof part.text === 'string' ? part.text : JSON.stringify(part, null, 2)
      )
      .filter((text) => text.length > 0)
      .join('\n\n');
  }
  return JSON.stringify(content, null, 2);
}

/**
 * @param {Record<string, unknown>} message
 * @returns {string | null}
 */
function reasoningOf(message) {
  if (typeof message.reasoning_content === 'string' && message.reasoning_content.trim()) {
    return message.reasoning_content;
  }
  if (typeof message.reasoning === 'string' && message.reasoning.trim()) return message.reasoning;
  if (Array.isArray(message.thinking_blocks)) {
    const text = message.thinking_blocks
      .map((block) => (isObject(block) && typeof block.thinking === 'string' ? block.thinking : ''))
      .filter(Boolean)
      .join('\n\n');
    if (text.trim()) return text;
  }
  return null;
}

/**
 * @param {unknown} seconds - Unix epoch seconds (possibly fractional).
 * @returns {string | null}
 */
function isoFromEpochSeconds(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * `function.arguments` is a JSON-encoded string in the OpenAI format; decode it when it parses
 * to an object so each argument gets its own row/code block, else keep it as-is.
 * @param {unknown} args
 * @returns {unknown}
 */
function decodeArguments(args) {
  if (typeof args !== 'string') return args;
  try {
    const parsed = JSON.parse(args);
    return isObject(parsed) ? parsed : args;
  } catch {
    return args;
  }
}

/**
 * @param {unknown} raw
 * @returns {Record<string, unknown>}
 */
function convertToolCall(raw) {
  const call = isObject(raw) ? raw : {};
  const fn = isObject(call.function) ? call.function : {};
  /** @type {Record<string, unknown>} */
  const out = {
    tool_call_id: typeof call.id === 'string' ? call.id : null,
    function_name: typeof fn.name === 'string' ? fn.name : 'unknown',
    arguments: decodeArguments(fn.arguments)
  };
  if (typeof call.type === 'string' && call.type !== 'function') out.type = call.type;
  return out;
}

// Keys a command-result JSON string is made of; `unpackCommandResult()` in strict mode refuses
// anything carrying other keys so arbitrary JSON printed by a command is never mistaken for one.
const COMMAND_RESULT_KEYS = new Set([
  'returncode',
  'output',
  'output_head',
  'output_tail',
  'elided_chars',
  'warning',
  'exception_info'
]);

/**
 * Unpacks a command result some harnesses encode as a JSON string (`{ returncode, output }`, or
 * `output_head` / `output_tail` / `elided_chars` / `warning` for truncated output, plus
 * `exception_info` when the command failed to run).
 * @param {string} text
 * @param {{ strict?: boolean }} [options] - `strict` additionally requires `returncode` and
 *   nothing but the known command-result keys.
 * @returns {{ content: string, fields: Record<string, unknown> } | null} The terminal output and
 *   every other field, or null when `text` isn't a command result.
 */
export function unpackCommandResult(text, { strict = false } = {}) {
  if (!text.trim().startsWith('{')) return null;
  /** @type {Record<string, unknown> | null} */
  let parsed = null;
  try {
    const value = JSON.parse(text);
    if (isObject(value)) parsed = value;
  } catch {
    parsed = null;
  }
  if (!parsed) return null;
  if (strict) {
    if (!('returncode' in parsed)) return null;
    if (!Object.keys(parsed).every((key) => COMMAND_RESULT_KEYS.has(key))) return null;
  } else if (!('output' in parsed || 'output_head' in parsed || 'returncode' in parsed)) {
    return null;
  }

  let content = '';
  if (typeof parsed.output === 'string') {
    content = parsed.output;
  } else if (typeof parsed.output_head === 'string' || typeof parsed.output_tail === 'string') {
    const elided =
      typeof parsed.elided_chars === 'number'
        ? `${parsed.elided_chars.toLocaleString('en-US')} characters elided`
        : 'output elided';
    content = `${parsed.output_head ?? ''}\n\n… [${elided}] …\n\n${parsed.output_tail ?? ''}`;
  }
  /** @type {Record<string, unknown>} */
  const fields = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (key === 'output' || key === 'output_head' || key === 'output_tail') continue;
    fields[key] = value;
  }
  return { content, fields };
}

/**
 * Converts one `tool` message into an observation result; content that isn't a command-result
 * JSON string is shown verbatim.
 * @param {Record<string, unknown>} message
 * @returns {Record<string, unknown>}
 */
export function convertToolResult(message) {
  const text = messageText(message.content);
  const extra = isObject(message.extra) ? message.extra : {};
  /** @type {Record<string, unknown>} */
  const result = {
    source_call_id: typeof message.tool_call_id === 'string' ? message.tool_call_id : null
  };

  const unpacked = unpackCommandResult(text);
  if (unpacked) {
    result.content = unpacked.content;
    Object.assign(result, unpacked.fields);
  } else {
    result.content = text;
  }

  // `extra` mirrors the parsed payload (`raw_output`, `returncode`, ...); only pick up an
  // exception the content itself didn't report.
  if (
    result.exception_info === undefined &&
    typeof extra.exception_info === 'string' &&
    extra.exception_info
  ) {
    result.exception_info = extra.exception_info;
  }
  const timestamp = isoFromEpochSeconds(extra.timestamp);
  if (timestamp) result.timestamp = timestamp;
  return result;
}

/**
 * @param {Record<string, unknown>} extra - The assistant message's `extra`.
 * @returns {Record<string, number> | null}
 */
function metricsOf(extra) {
  /** @type {Record<string, number>} */
  const metrics = {};
  const response = isObject(extra.response) ? extra.response : {};
  const usage = isObject(response.usage)
    ? response.usage
    : isObject(extra.usage)
      ? extra.usage
      : {};
  if (typeof usage.prompt_tokens === 'number') metrics.prompt_tokens = usage.prompt_tokens;
  if (typeof usage.completion_tokens === 'number') {
    metrics.completion_tokens = usage.completion_tokens;
  }
  const promptDetails = isObject(usage.prompt_tokens_details) ? usage.prompt_tokens_details : {};
  if (typeof promptDetails.cached_tokens === 'number') {
    metrics.cached_tokens = promptDetails.cached_tokens;
  } else if (typeof usage.cache_read_input_tokens === 'number') {
    metrics.cached_tokens = usage.cache_read_input_tokens;
  }
  const completionDetails = isObject(usage.completion_tokens_details)
    ? usage.completion_tokens_details
    : {};
  if (typeof completionDetails.reasoning_tokens === 'number') {
    metrics.reasoning_tokens = completionDetails.reasoning_tokens;
  }
  if (typeof extra.cost === 'number') metrics.cost_usd = extra.cost;
  return Object.keys(metrics).length > 0 ? metrics : null;
}

/**
 * @param {Record<string, unknown>} message
 * @returns {Record<string, unknown>}
 */
function passthroughKeys(message) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, value] of Object.entries(message)) {
    if (!HANDLED_MESSAGE_KEYS.has(key) && key !== 'reasoning') out[key] = value;
  }
  return out;
}

/**
 * @param {Record<string, unknown>} message
 * @returns {Record<string, unknown>}
 */
function convertAssistant(message) {
  const extra = isObject(message.extra) ? message.extra : {};
  const response = isObject(extra.response) ? extra.response : {};
  const choice =
    Array.isArray(response.choices) && isObject(response.choices[0]) ? response.choices[0] : {};
  const toolCalls = Array.isArray(message.tool_calls)
    ? message.tool_calls.map(convertToolCall)
    : [];

  /** @type {Record<string, unknown>} */
  const step = {
    source: 'agent',
    message: messageText(message.content)
  };
  const timestamp = isoFromEpochSeconds(extra.timestamp);
  if (timestamp) step.timestamp = timestamp;
  if (typeof response.model === 'string') step.model_name = response.model;
  const reasoning = reasoningOf(message);
  if (reasoning) step.reasoning_content = reasoning;
  if (toolCalls.length > 0) step.tool_calls = toolCalls;
  const metrics = metricsOf(extra);
  if (metrics) step.metrics = metrics;
  if (typeof choice.finish_reason === 'string') step.finish_reason = choice.finish_reason;
  if (isObject(message.function_call)) step.function_call = message.function_call;

  return { ...step, ...passthroughKeys(message) };
}

/**
 * @param {Record<string, unknown>} message
 * @returns {Record<string, unknown>}
 */
function convertOther(message) {
  const extra = isObject(message.extra) ? message.extra : {};
  const role = /** @type {string} */ (message.role);
  /** @type {Record<string, unknown>} */
  const step = { source: role, message: messageText(message.content) };
  const timestamp = isoFromEpochSeconds(extra.timestamp);
  if (timestamp) step.timestamp = timestamp;

  if (role === 'exit') {
    if (typeof extra.exit_status === 'string') {
      step.exit_status = extra.exit_status;
      if (!step.message) step.message = `Exit status: ${extra.exit_status}`;
      if (extra.exit_status === 'Submitted') step.task_complete = true;
    }
    if (typeof extra.submission === 'string') step.submission = extra.submission;
  } else if (role === 'tool') {
    step.observation = { results: [convertToolResult(message)] };
    step.message = '';
  }
  // A tool result's `extra` only mirrors what `convertToolResult()` already mapped.
  if (role !== 'tool') {
    for (const [key, value] of Object.entries(extra)) {
      if (key !== 'timestamp' && !(key in step)) step[key] = value;
    }
  }
  return { ...step, ...passthroughKeys(message) };
}

/**
 * Pulls the trajectory-level fields out of an `info` block (agent version, model, exit status,
 * cost / API-call totals) and passes every other top-level key through.
 * @param {Record<string, unknown> | null} container
 * @param {Record<string, unknown>[]} steps - Converted steps, for token totals.
 * @returns {Record<string, unknown>}
 */
function trajectoryFields(container, steps) {
  if (!container) return {};
  const info = isObject(container.info) ? container.info : {};
  const config = isObject(info.config) ? info.config : {};
  const model = isObject(config.model) ? config.model : {};
  const modelStats = isObject(info.model_stats) ? info.model_stats : {};

  /** @type {Record<string, unknown>} */
  const out = {};
  if (typeof container.trajectory_format === 'string') {
    out.schema_version = container.trajectory_format;
  }
  // Whatever `info` key carries the agent's version (`version`, `<something>_version`).
  const versionKey = Object.keys(info).find(
    (key) => /(^|_)version$/.test(key) && typeof info[key] === 'string'
  );
  out.agent = {
    name: typeof info.agent_name === 'string' ? info.agent_name : null,
    version: versionKey ? info[versionKey] : null,
    model_name: typeof model.model_name === 'string' ? model.model_name : null
  };

  /** @type {Record<string, number>} */
  const totals = { total_prompt_tokens: 0, total_completion_tokens: 0, total_cached_tokens: 0 };
  let hasTokens = false;
  for (const step of steps) {
    if (!isObject(step.metrics)) continue;
    const m = /** @type {Record<string, unknown>} */ (step.metrics);
    for (const [key, total] of [
      ['prompt_tokens', 'total_prompt_tokens'],
      ['completion_tokens', 'total_completion_tokens'],
      ['cached_tokens', 'total_cached_tokens']
    ]) {
      if (typeof m[key] === 'number') {
        totals[total] += /** @type {number} */ (m[key]);
        hasTokens = true;
      }
    }
  }
  const finalMetrics = { ...(hasTokens ? totals : {}), ...modelStats };
  if (Object.keys(finalMetrics).length > 0) out.final_metrics = finalMetrics;

  for (const [key, value] of Object.entries(info)) {
    if (key !== 'model_stats' && key !== versionKey && key !== 'agent_name') out[key] = value;
  }
  for (const [key, value] of Object.entries(container)) {
    if (!HANDLED_TOP_KEYS.has(key)) out[key] = value;
  }
  return out;
}

/**
 * When the run ends with a successful `exit` step, the agent step right before it is the one that
 * submitted. Harnesses typically intercept that submit call instead of running it, so its result
 * reports an exception ("not executed") that isn't a real failure: mark the step complete and
 * keep the exception text as a plain metadata row instead of an error notice.
 * @param {Record<string, unknown>[]} steps
 */
function markSubmittingStep(steps) {
  const last = steps.at(-1);
  const prev = steps.at(-2);
  if (!last || !prev || last.source !== 'exit' || last.task_complete !== true) return;
  if (prev.source !== 'agent') return;
  prev.task_complete = true;
  const observation = isObject(prev.observation) ? prev.observation : null;
  if (!observation || !Array.isArray(observation.results)) return;
  for (const result of observation.results) {
    if (isObject(result) && typeof result.exception_info === 'string') {
      result.submission_note = result.exception_info;
      delete result.exception_info;
    }
  }
}

/**
 * Converts a chat-messages trajectory into a steps-shaped trajectory, or returns null when `data`
 * holds no messages array (so the caller can fall back to its own error).
 * @param {unknown} data
 * @returns {MessagesConversion | null}
 */
export function messagesToTrajectory(data) {
  const resolved = resolveMessages(data);
  if (!resolved) return null;
  const { messages, container } = resolved;

  /** @type {Record<string, unknown>[]} */
  const steps = [];
  /** @type {unknown[][]} */
  const rawSteps = [];
  /** @type {Map<string, number>} */
  const callOwner = new Map();
  let lastAssistant = -1;

  for (const message of messages) {
    if (message.role === 'tool') {
      const callId = typeof message.tool_call_id === 'string' ? message.tool_call_id : null;
      const owner = (callId !== null ? callOwner.get(callId) : undefined) ?? lastAssistant;
      if (owner !== -1) {
        const step = steps[owner];
        const observation = /** @type {{ results: unknown[] }} */ (
          step.observation ?? (step.observation = { results: [] })
        );
        observation.results.push(convertToolResult(message));
        rawSteps[owner].push(message);
        continue;
      }
      steps.push(convertOther(message));
      rawSteps.push([message]);
      continue;
    }
    if (message.role === 'assistant') {
      const step = convertAssistant(message);
      lastAssistant = steps.length;
      for (const tc of /** @type {Record<string, unknown>[]} */ (step.tool_calls ?? [])) {
        if (typeof tc.tool_call_id === 'string') callOwner.set(tc.tool_call_id, lastAssistant);
      }
      steps.push(step);
    } else {
      steps.push(convertOther(message));
    }
    rawSteps.push([message]);
  }

  markSubmittingStep(steps);
  steps.forEach((step, i) => {
    step.step_id = i + 1;
  });
  return {
    trajectory: { ...trajectoryFields(container, steps), steps },
    rawSteps: rawSteps.map((group) => (group.length === 1 ? group[0] : group))
  };
}
