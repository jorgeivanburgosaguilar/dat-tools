/**
 * Schema-tolerant normalizer for "agent trajectory" JSON logs (an agent's step-by-step transcript
 * of messages, tool calls and observations against a task). The real-world samples this was
 * designed against all report the same `schema_version` string and shape, but nothing here
 * assumes that shape holds forever: every level (trajectory, agent, step, tool call,
 * observation) recognizes a small set of known keys and routes everything else through
 * `collectMetadata()` into a flat `{ path, value, isJson }` list, so a schema change never makes
 * data disappear from the viewer - worst case a field shows up as a generic key/value row instead
 * of a purpose-built widget.
 *
 * Pure and DOM-free - safe to import from either Vitest project.
 */

/**
 * @typedef {Object} MetadataEntry
 * @property {string} path - Dotted key path relative to the object this list was collected from.
 * @property {string} value - Display string; already JSON.stringify'd when isJson is true.
 * @property {boolean} isJson
 */

/**
 * @typedef {Object} MetricEntry
 * @property {string} key
 * @property {unknown} value
 * @property {string} display
 */

/**
 * @typedef {Object} CodeArgument
 * @property {string} label
 * @property {string} code
 */

/**
 * @typedef {'ok' | 'warn' | 'err'} IssueLevel
 */

/**
 * @typedef {Object} MessageField
 * @property {string} key
 * @property {string} value
 */

/**
 * @typedef {Object} ObservationResult
 * @property {string | null} sourceCallId
 * @property {string} content
 * @property {string} notice - Extracted harness or execution notice, if present.
 * @property {string | null} marker - Matched terminal output marker, if present.
 * @property {string} terminal - Terminal content payload.
 * @property {IssueLevel} level - 'ok' | 'warn' | 'err'
 * @property {MetadataEntry[]} metadata
 */

/**
 * @typedef {Object} ToolCall
 * @property {string | null} toolCallId
 * @property {string} functionName
 * @property {CodeArgument[]} codeArgs
 * @property {MetadataEntry[]} metadata
 * @property {ObservationResult[]} observations - Results linked to this call by source_call_id.
 */

/**
 * @typedef {Object} TrajectoryAgent
 * @property {string | null} name
 * @property {string | null} version
 * @property {string | null} modelName
 * @property {MetadataEntry[]} metadata
 */

/**
 * @typedef {Object} TrajectoryStep
 * @property {number} stepId
 * @property {string | null} timestamp
 * @property {string} source
 * @property {string} message
 * @property {MessageField[]} messageFields - Fields recovered from a structured (JSON-shaped)
 *   message, empty when `message` is plain prose.
 * @property {boolean} messageMalformed - True when `message` looked JSON-shaped but failed to
 *   parse and `messageFields` was recovered on a best-effort basis instead.
 * @property {string | null} reasoningContent
 * @property {string | null} modelName
 * @property {IssueLevel} level
 * @property {boolean} isTaskComplete
 * @property {ToolCall[]} toolCalls
 * @property {ObservationResult[]} stepObservations - Results with no matching tool call.
 * @property {MetadataEntry[]} observationMetadata - Unknown keys on the `observation` object itself.
 * @property {MetricEntry[]} metrics
 * @property {MetadataEntry[]} metadata
 * @property {unknown} raw - The original, unmodified step object, for the Raw JSON view.
 */

/**
 * @typedef {Object} Trajectory
 * @property {true} ok
 * @property {string | null} schemaVersion
 * @property {string | null} sessionId
 * @property {TrajectoryAgent} agent
 * @property {TrajectoryStep[]} steps
 * @property {MetricEntry[]} finalMetrics
 * @property {MetadataEntry[]} metadata
 */

/**
 * The payload `TrajectoryLoader.svelte` hands up to whatever loaded it, once parsing,
 * normalizing and preparing the highlighter have all succeeded. Defined here (rather than in the
 * component) so it can be imported by JSDoc `import()` type references the same way any other
 * type in this module can - a `.svelte` file's own type exports aren't reliably resolvable that
 * way.
 * @typedef {Object} TrajectoryLoadResult
 * @property {Trajectory} trajectory
 * @property {import('./syntax-highlight.js').Lowlight | null} lowlight
 */

/**
 * @typedef {Object} TrajectoryError
 * @property {false} ok
 * @property {string} reason
 */

export const TERMINAL_MARKERS = [
  'New Terminal Output:',
  'Current Terminal Screen:',
  'Current terminal state:'
];

const KNOWN_TOP_KEYS = ['schema_version', 'session_id', 'agent', 'steps', 'final_metrics'];
const KNOWN_AGENT_KEYS = ['name', 'version', 'model_name'];
const KNOWN_STEP_KEYS = [
  'step_id',
  'timestamp',
  'source',
  'message',
  'reasoning_content',
  'reasoning',
  'model_name',
  'tool_calls',
  'observation',
  'metrics'
];
const KNOWN_TOOL_CALL_KEYS = ['tool_call_id', 'function_name', 'arguments'];
const KNOWN_OBSERVATION_KEYS = ['results'];
const KNOWN_OBSERVATION_RESULT_KEYS = ['source_call_id', 'content'];

// A string argument at or above this length (or containing a newline at all) is treated as code
// rather than a scalar metadata value - covers today's `keystrokes` and whatever a future tool
// calls its long-form payload.
const CODE_ARG_MIN_LENGTH = 40;

const SUMMARY_MAX_LENGTH = 140;

/**
 * Recursively collects every own key of `obj` that isn't in `knownKeys` into a flat list. A
 * plain nested object is flattened into the same list under a dotted path (so
 * `{ extra: { parser: 'xml' } }` becomes one entry at path `extra.parser`, not a nested blob);
 * arrays and other values are stringified as JSON. This is what lets the viewer survive schema
 * drift: called at every level (trajectory, agent, step, tool call, observation, observation
 * result), it guarantees nothing recognized-but-unhandled is ever silently dropped.
 * @param {unknown} obj
 * @param {string[]} [knownKeys]
 * @param {string} [basePath]
 * @returns {MetadataEntry[]}
 */
export function collectMetadata(obj, knownKeys = [], basePath = '') {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [];
  const known = new Set(knownKeys);
  /** @type {MetadataEntry[]} */
  const entries = [];
  for (const [key, value] of Object.entries(obj)) {
    if (known.has(key)) continue;
    const path = basePath ? `${basePath}.${key}` : key;
    if (value === null || value === undefined) {
      entries.push({ path, value: 'null', isJson: false });
    } else if (Array.isArray(value)) {
      entries.push({ path, value: JSON.stringify(value, null, 2), isJson: true });
    } else if (typeof value === 'object') {
      entries.push(...collectMetadata(value, [], path));
    } else {
      entries.push({ path, value: String(value), isJson: false });
    }
  }
  return entries;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function stringifyValue(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

/**
 * @param {string} key
 * @param {unknown} value
 * @returns {string}
 */
function formatMetricValue(key, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return stringifyValue(value);
  const lowerKey = key.toLowerCase();
  if (lowerKey.includes('cost')) {
    if (value === 0) return '$0.00';
    const fixed = value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
    return `$${fixed}`;
  }
  if (lowerKey.includes('token')) return value.toLocaleString('en-US');
  return String(value);
}

/**
 * @param {unknown} raw
 * @returns {MetricEntry[]}
 */
export function metricEntries(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  return Object.entries(raw).map(([key, value]) => ({
    key,
    value,
    display: formatMetricValue(key, value)
  }));
}

/**
 * @param {unknown} raw
 * @returns {{ codeArgs: CodeArgument[], metadata: MetadataEntry[] }}
 */
function splitArguments(raw) {
  if (raw === null || raw === undefined) return { codeArgs: [], metadata: [] };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      codeArgs: [],
      metadata: [{ path: 'arguments', value: stringifyValue(raw), isJson: typeof raw === 'object' }]
    };
  }
  /** @type {CodeArgument[]} */
  const codeArgs = [];
  /** @type {MetadataEntry[]} */
  const metadata = [];
  for (const [key, value] of Object.entries(raw)) {
    if (
      typeof value === 'string' &&
      (value.includes('\n') || value.length >= CODE_ARG_MIN_LENGTH)
    ) {
      codeArgs.push({ label: key, code: value });
    } else {
      metadata.push({
        path: `arguments.${key}`,
        value: stringifyValue(value),
        isJson: value !== null && typeof value === 'object'
      });
    }
  }
  return { codeArgs, metadata };
}

/**
 * @param {unknown} raw
 * @returns {ToolCall}
 */
function normalizeToolCall(raw) {
  const obj = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {};
  const toolCallId = typeof obj.tool_call_id === 'string' ? obj.tool_call_id : null;
  const functionName = typeof obj.function_name === 'string' ? obj.function_name : 'unknown';
  const { codeArgs, metadata: argMetadata } = splitArguments(obj.arguments);
  const metadata = [...collectMetadata(obj, KNOWN_TOOL_CALL_KEYS), ...argMetadata];
  return { toolCallId, functionName, codeArgs, metadata, observations: [] };
}

/**
 * Splits observation content into an optional harness notice prefix, matched marker, and terminal output.
 * @param {string} content
 * @returns {{ notice: string, marker: string | null, terminal: string }}
 */
export function splitObservation(content) {
  const text = content || '';
  let idx = -1;
  /** @type {string | null} */
  let marker = null;
  for (const m of TERMINAL_MARKERS) {
    const i = text.indexOf(m);
    if (i !== -1 && (idx === -1 || i < idx)) {
      idx = i;
      marker = m;
    }
  }
  if (idx === -1) {
    if (/^\s*Previous response had/i.test(text)) {
      return { notice: text.trim(), marker: null, terminal: '' };
    }
    return { notice: '', marker: null, terminal: text };
  }
  const m = /** @type {string} */ (marker);
  return {
    notice: text.slice(0, idx).trim(),
    marker: m,
    terminal: text.slice(idx + m.length).replace(/^\n/, '')
  };
}

/**
 * Classifies an observation notice string into 'err', 'warn', or 'ok'.
 * @param {string} notice
 * @returns {IssueLevel}
 */
export function noticeLevel(notice) {
  if (!notice) return 'ok';
  if (/^Previous response had parsing errors/i.test(notice) || /(^|\n)\s*ERROR/i.test(notice)) {
    return 'err';
  }
  if (/^Previous response had warnings/i.test(notice) || /(^|\n)\s*WARNINGS?/i.test(notice)) {
    return 'warn';
  }
  return 'ok';
}

/**
 * @param {string} source
 * @param {ObservationResult[]} results
 * @returns {IssueLevel}
 */
export function detectStepLevel(source, results) {
  if (source === 'user') return 'ok';
  let level = /** @type {IssueLevel} */ ('ok');
  for (const res of results) {
    if (res.level === 'err') return 'err';
    if (res.level === 'warn') level = 'warn';
  }
  return level;
}

/**
 * @param {ToolCall[]} toolCalls
 * @param {Record<string, unknown>} rawStep
 * @returns {boolean}
 */
export function isTaskCompleteStep(toolCalls, rawStep) {
  if (
    toolCalls.some(
      (c) => c.functionName === 'mark_task_complete' || c.functionName === 'task_complete'
    )
  ) {
    return true;
  }
  if (rawStep && (rawStep.task_complete === true || rawStep.is_task_complete === true)) {
    return true;
  }
  return false;
}

/**
 * @param {unknown} raw
 * @returns {{ results: ObservationResult[], metadata: MetadataEntry[] }}
 */
function normalizeObservation(raw) {
  if (!raw || typeof raw !== 'object') return { results: [], metadata: [] };
  const obj = /** @type {Record<string, unknown>} */ (raw);
  const resultsRaw = Array.isArray(obj.results) ? obj.results : [];
  const results = resultsRaw.map((r) => {
    const resultObj = r && typeof r === 'object' ? /** @type {Record<string, unknown>} */ (r) : {};
    const content =
      typeof resultObj.content === 'string'
        ? resultObj.content
        : resultObj.content !== undefined
          ? stringifyValue(resultObj.content)
          : '';
    const parts = splitObservation(content);
    const level = noticeLevel(parts.notice);
    return {
      sourceCallId: typeof resultObj.source_call_id === 'string' ? resultObj.source_call_id : null,
      content,
      notice: parts.notice,
      marker: parts.marker,
      terminal: parts.terminal,
      level,
      metadata: collectMetadata(resultObj, KNOWN_OBSERVATION_RESULT_KEYS)
    };
  });
  return { results, metadata: collectMetadata(obj, KNOWN_OBSERVATION_KEYS) };
}

/**
 * Attaches each observation result to the tool call whose id matches its `source_call_id`.
 * When a step has several tool calls, the samples show a single merged observation result with
 * no `source_call_id` at all - such results (and any that reference an id not present in this
 * step) fall through to `stepObservations` rather than being dropped.
 * @param {ToolCall[]} toolCalls
 * @param {ObservationResult[]} results
 * @returns {{ toolCalls: ToolCall[], stepObservations: ObservationResult[] }}
 */
export function linkObservations(toolCalls, results) {
  const linkedToolCalls = toolCalls.map((tc) => ({
    ...tc,
    observations: /** @type {ObservationResult[]} */ ([])
  }));
  const byId = new Map(linkedToolCalls.map((tc) => [tc.toolCallId, tc]));
  /** @type {ObservationResult[]} */
  const stepObservations = [];
  for (const result of results) {
    const target = result.sourceCallId ? byId.get(result.sourceCallId) : undefined;
    if (target) target.observations.push(result);
    else stepObservations.push(result);
  }
  return { toolCalls: linkedToolCalls, stepObservations };
}

/**
 * Strips one outer fenced code block (```lang\n...\n```), greedy to the *last* fence so a message
 * whose own content contains nested fences still has just the outer wrapper removed. Returns the
 * input unchanged when there is no outer fence.
 * @param {string} text
 * @returns {string}
 */
function stripOuterFence(text) {
  const match = text.match(/^```[a-zA-Z]*\s*\n([\s\S]*)\n?```\s*$/);
  return match ? match[1].trim() : text;
}

/**
 * @param {string} text
 * @returns {string}
 */
function unescapeLoose(text) {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

/**
 * Best-effort extraction of top-level `"key": "value"` string pairs from JSON that failed to
 * parse, so a truncated or malformed structured message is still readable instead of an opaque
 * blob. Generic over key names - no schema assumptions about which fields exist.
 * @param {string} text
 * @returns {MessageField[]}
 */
export function recoverJsonFields(text) {
  /** @type {MessageField[]} */
  const fields = [];
  const pattern = /"([^"\\]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    fields.push({ key: match[1], value: unescapeLoose(match[2]) });
  }
  return fields;
}

/**
 * Parses a step message that may be a plain-prose string or a JSON-shaped object (optionally
 * wrapped in a fenced code block). Well-formed JSON yields its top-level string fields; malformed
 * JSON falls back to a best-effort field recovery so the step stays readable. Plain prose is left
 * untouched (empty `fields`) and renders exactly as before.
 * @param {string} message
 * @returns {{ fields: MessageField[], malformed: boolean }}
 */
export function parseStructuredMessage(message) {
  const text = stripOuterFence((message || '').trim());
  if (!text.startsWith('{')) return { fields: [], malformed: false };
  try {
    const parsed = JSON.parse(text);
    /** @type {MessageField[]} */
    const fields = [];
    if (parsed && typeof parsed === 'object') {
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string') fields.push({ key, value });
      }
    }
    return { fields, malformed: false };
  } catch {
    return { fields: recoverJsonFields(text), malformed: true };
  }
}

/**
 * @param {unknown} raw
 * @param {number} index
 * @returns {TrajectoryStep}
 */
function normalizeStep(raw, index) {
  const obj = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {};
  const stepId = typeof obj.step_id === 'number' ? obj.step_id : index + 1;
  const timestamp = typeof obj.timestamp === 'string' ? obj.timestamp : null;
  const source = typeof obj.source === 'string' ? obj.source : 'unknown';
  const message = typeof obj.message === 'string' ? obj.message : '';
  const { fields: messageFields, malformed: messageMalformed } = parseStructuredMessage(message);
  const reasoningContent =
    typeof obj.reasoning_content === 'string'
      ? obj.reasoning_content
      : typeof obj.reasoning === 'string'
        ? obj.reasoning
        : null;
  const modelName = typeof obj.model_name === 'string' ? obj.model_name : null;
  const toolCallsRaw = Array.isArray(obj.tool_calls) ? obj.tool_calls.map(normalizeToolCall) : [];
  const observation = normalizeObservation(obj.observation);
  const { toolCalls, stepObservations } = linkObservations(toolCallsRaw, observation.results);
  // Deliberately not folded into `level`: a malformed message on step N is normally paired with
  // a harness notice on step N+1 reporting the same failure, so counting both here would
  // double-count one problem in `trajectoryStats()`'s error/warning totals. `messageMalformed`
  // still surfaces visually via a badge - see TrajectoryStepDetail.svelte.
  const level = detectStepLevel(source, observation.results);
  const isTaskComplete = isTaskCompleteStep(toolCalls, obj);
  const metrics = metricEntries(obj.metrics);
  const metadata = collectMetadata(obj, KNOWN_STEP_KEYS);
  return {
    stepId,
    timestamp,
    source,
    message,
    messageFields,
    messageMalformed,
    reasoningContent,
    modelName,
    level,
    isTaskComplete,
    toolCalls,
    stepObservations,
    observationMetadata: observation.metadata,
    metrics,
    metadata,
    raw
  };
}

/**
 * @param {unknown} raw
 * @returns {TrajectoryAgent}
 */
function normalizeAgent(raw) {
  if (!raw || typeof raw !== 'object')
    return { name: null, version: null, modelName: null, metadata: [] };
  const obj = /** @type {Record<string, unknown>} */ (raw);
  return {
    name: typeof obj.name === 'string' ? obj.name : null,
    version: typeof obj.version === 'string' ? obj.version : null,
    modelName: typeof obj.model_name === 'string' ? obj.model_name : null,
    metadata: collectMetadata(obj, KNOWN_AGENT_KEYS)
  };
}

/**
 * Finds the steps array and the object that carries the trajectory-level fields, tolerating a
 * few reasonable top-level shapes: `{ steps: [...] }`, that same shape nested under a
 * `trajectory` key, or a bare array of steps with no wrapper at all.
 * @param {unknown} data
 * @returns {{ stepsRaw: unknown[], container: Record<string, unknown> | null } | null}
 */
function resolveRoot(data) {
  if (Array.isArray(data)) return { stepsRaw: data, container: null };
  if (data && typeof data === 'object') {
    const obj = /** @type {Record<string, unknown>} */ (data);
    if (Array.isArray(obj.steps)) return { stepsRaw: obj.steps, container: obj };
    if (obj.trajectory && typeof obj.trajectory === 'object') {
      const inner = /** @type {Record<string, unknown>} */ (obj.trajectory);
      if (Array.isArray(inner.steps)) return { stepsRaw: inner.steps, container: inner };
      if (Array.isArray(/** @type {unknown} */ (inner))) {
        return {
          stepsRaw: /** @type {unknown[]} */ (/** @type {unknown} */ (inner)),
          container: null
        };
      }
    }
  }
  return null;
}

/**
 * Normalizes an already-parsed JSON value into a `Trajectory`, or reports why it couldn't.
 * @param {unknown} data
 * @returns {Trajectory | TrajectoryError}
 */
export function normalizeTrajectory(data) {
  const resolved = resolveRoot(data);
  if (!resolved) {
    return {
      ok: false,
      reason:
        'No steps array found. Expected an object with a "steps" array (optionally nested under "trajectory"), or a bare array of steps.'
    };
  }
  const { stepsRaw, container } = resolved;
  const steps = stepsRaw.map((raw, i) => normalizeStep(raw, i));
  return {
    ok: true,
    schemaVersion: typeof container?.schema_version === 'string' ? container.schema_version : null,
    sessionId: typeof container?.session_id === 'string' ? container.session_id : null,
    agent: normalizeAgent(container?.agent),
    steps,
    finalMetrics: metricEntries(container?.final_metrics),
    metadata: container ? collectMetadata(container, KNOWN_TOP_KEYS) : []
  };
}

/**
 * A short, single-line summary of a step for the list row: the first non-empty line of its
 * message, collapsed to single spaces and truncated. Falls back to the tool names, then a
 * placeholder, for a step with no message text at all.
 * @param {{ message: string, toolCalls: { functionName: string }[] }} step - Only these two
 *   fields are read, so a plain object with just them (as in tests) works too.
 * @returns {string}
 */
export function stepSummary(step) {
  const text = step.message.trim();
  if (!text) {
    if (step.toolCalls.length > 0) return step.toolCalls.map((tc) => tc.functionName).join(', ');
    return '(no message)';
  }
  const firstLine = text.split('\n').find((line) => line.trim().length > 0) ?? '';
  const collapsed = firstLine.replace(/\s+/g, ' ').trim();
  return collapsed.length > SUMMARY_MAX_LENGTH
    ? `${collapsed.slice(0, SUMMARY_MAX_LENGTH - 1)}…`
    : collapsed;
}

/**
 * @param {string | null} prevTimestamp
 * @param {string | null} timestamp
 * @returns {number | null}
 */
export function deltaMs(prevTimestamp, timestamp) {
  if (!prevTimestamp || !timestamp) return null;
  const a = Date.parse(prevTimestamp);
  const b = Date.parse(timestamp);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return b - a;
}

/**
 * @param {number | null} ms
 * @returns {string}
 */
export function formatDelta(ms) {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return '';
  const sign = ms < 0 ? '-' : '+';
  const abs = Math.abs(ms);
  if (abs < 1000) return `${sign}${Math.round(abs)}ms`;
  return `${sign}${(abs / 1000).toFixed(1)}s`;
}

/**
 * @typedef {Object} TrajectoryStats
 * @property {number} totalSteps
 * @property {Record<string, number>} bySource
 * @property {string[]} tools - Sorted, de-duplicated tool (function) names, for a filter dropdown.
 * @property {Record<string, number>} byTool
 * @property {number} errorCount
 * @property {number} warningCount
 * @property {number} issueCount
 * @property {MetricEntry[]} totals - `finalMetrics` when present, else summed from per-step metrics.
 */

/**
 * @param {Trajectory} trajectory
 * @returns {TrajectoryStats}
 */
export function trajectoryStats(trajectory) {
  /** @type {Record<string, number>} */
  const bySource = {};
  /** @type {Record<string, number>} */
  const byTool = {};
  let errorCount = 0;
  let warningCount = 0;
  const sums = { prompt_tokens: 0, completion_tokens: 0, cached_tokens: 0, cost_usd: 0 };
  let hasMetrics = false;

  for (const step of trajectory.steps) {
    bySource[step.source] = (bySource[step.source] ?? 0) + 1;
    if (step.level === 'err') errorCount++;
    else if (step.level === 'warn') warningCount++;

    for (const tc of step.toolCalls) {
      byTool[tc.functionName] = (byTool[tc.functionName] ?? 0) + 1;
    }
    for (const metric of step.metrics) {
      if (metric.key in sums && typeof metric.value === 'number') {
        hasMetrics = true;
        sums[/** @type {keyof typeof sums} */ (metric.key)] += metric.value;
      }
    }
  }

  const totals =
    trajectory.finalMetrics.length > 0
      ? trajectory.finalMetrics
      : hasMetrics
        ? Object.entries(sums).map(([key, value]) => ({
            key,
            value,
            display: formatMetricValue(key, value)
          }))
        : [];

  return {
    totalSteps: trajectory.steps.length,
    bySource,
    tools: Object.keys(byTool).sort(),
    byTool,
    errorCount,
    warningCount,
    issueCount: errorCount + warningCount,
    totals
  };
}

/**
 * Builds one lowercased search haystack per step (message, fields recovered from a structured
 * message, reasoning, tool call code arguments, and observation content / notices), computed once
 * per load so filtering ~100 steps on every keystroke is a cheap substring scan rather than a
 * re-walk of the whole tree.
 * @param {TrajectoryStep[]} steps
 * @returns {string[]}
 */
export function buildSearchIndex(steps) {
  return steps.map((step) => {
    const parts = [step.message];
    for (const field of step.messageFields) parts.push(field.value);
    if (step.reasoningContent) parts.push(step.reasoningContent);
    for (const tc of step.toolCalls) {
      parts.push(tc.functionName);
      for (const arg of tc.codeArgs) parts.push(arg.code);
      for (const obs of tc.observations) {
        if (obs.notice) parts.push(obs.notice);
        parts.push(obs.terminal || obs.content);
      }
    }
    for (const obs of step.stepObservations) {
      if (obs.notice) parts.push(obs.notice);
      parts.push(obs.terminal || obs.content);
    }
    return parts.join('\n').toLowerCase();
  });
}

/**
 * @typedef {Object} StepFilters
 * @property {string} [query]
 * @property {string} [source] - 'all' or an exact `step.source` value.
 * @property {string} [tool] - 'all' or an exact tool call function name.
 * @property {'all' | 'issues' | 'errors' | 'warnings'} [issueFilter]
 */

/**
 * @param {TrajectoryStep[]} steps
 * @param {string[]} searchIndex - From `buildSearchIndex(steps)`.
 * @param {StepFilters} [filters]
 * @returns {number[]} Indices into `steps` that match every active filter.
 */
export function filterSteps(steps, searchIndex, filters = {}) {
  const { query = '', source = 'all', tool = 'all', issueFilter = 'all' } = filters;
  const q = query.trim().toLowerCase();
  /** @type {number[]} */
  const matches = [];
  steps.forEach((step, i) => {
    if (source !== 'all' && step.source !== source) return;
    if (tool !== 'all' && !step.toolCalls.some((tc) => tc.functionName === tool)) return;
    if (issueFilter === 'errors' && step.level !== 'err') return;
    if (issueFilter === 'warnings' && step.level !== 'warn') return;
    if (issueFilter === 'issues' && step.level !== 'err' && step.level !== 'warn') return;
    if (q && !searchIndex[i]?.includes(q)) return;
    matches.push(i);
  });
  return matches;
}

/**
 * A small, fictional trajectory bundled for the "Load example" button. Not derived from - and
 * deliberately not shaped like a copy of - any real trajectory file; it exists to exercise every
 * renderer at once: a user step with only a message, markdown in an agent message (heading,
 * list, bold, fenced code), a step with reasoning content, a step with a warning notice in
 * observation, a step with a malformed (truncated-JSON) message paired with an error notice, a
 * step with two tool calls sharing one observation that has no `source_call_id`, metrics that
 * omit `cached_tokens`, and unknown fields at both the trajectory and step level so the generic
 * metadata rendering is visible without loading a real file.
 */
export const EXAMPLE_TRAJECTORY = JSON.stringify(
  {
    schema_version: 'example-v1',
    session_id: 'example-4f2c-4b7a-9e1d-000000000000',
    agent: {
      name: 'example-agent',
      version: '0.1.0',
      model_name: 'anthropic/claude-example',
      extra: { parser: 'xml' }
    },
    run_metadata: {
      sandbox: 'demo-sandbox-1',
      region: 'us-east-1'
    },
    steps: [
      {
        step_id: 1,
        timestamp: '2026-01-01T00:00:00.000000+00:00',
        source: 'user',
        message:
          'Fix the failing test in `calc.py`: `test_add` expects `add(2, 2)` to return 4, but the ' +
          'current implementation returns 5.'
      },
      {
        step_id: 2,
        timestamp: '2026-01-01T00:00:01.500000+00:00',
        source: 'agent',
        model_name: 'claude-example',
        reasoning_content:
          'The user reported a bug in `calc.py` where `add(2, 2)` returns 5 instead of 4. ' +
          'I should inspect `calc.py` to identify the implementation mistake.',
        message:
          '## Analysis\n\nThe repository has one module, `calc.py`, with a single `add` function. ' +
          "Let's look at it before making a change.\n\n" +
          '**Plan**\n- Print the file\n- Locate the bug\n- Fix it and re-run the tests',
        tool_calls: [
          {
            tool_call_id: 'call_1_1',
            function_name: 'bash_command',
            arguments: { keystrokes: 'cat calc.py\n', duration: 0.1 }
          }
        ],
        observation: {
          results: [
            {
              source_call_id: 'call_1_1',
              content:
                'New Terminal Output:\nroot@sandbox:/app# cat calc.py\ndef add(a, b):\n    return a + b + 1\n'
            }
          ]
        },
        metrics: { prompt_tokens: 812, completion_tokens: 96, cached_tokens: 0, cost_usd: 0.00041 }
      },
      {
        step_id: 3,
        timestamp: '2026-01-01T00:00:02.500000+00:00',
        source: 'agent',
        model_name: 'claude-example',
        message: 'Checking for any existing virtual environment or dependencies.',
        tool_calls: [
          {
            tool_call_id: 'call_1_2',
            function_name: 'bash_command',
            arguments: { keystrokes: 'which pytest\n', duration: 0.1 }
          }
        ],
        observation: {
          results: [
            {
              source_call_id: 'call_1_2',
              content:
                'Previous response had warnings:\nNon-standard environment path detected\nNew Terminal Output:\n/usr/local/bin/pytest\n'
            }
          ]
        },
        metrics: { prompt_tokens: 420, completion_tokens: 45, cost_usd: 0.00018 }
      },
      {
        step_id: 4,
        timestamp: '2026-01-01T00:00:03.200000+00:00',
        source: 'agent',
        model_name: 'claude-example',
        message:
          '{"analysis": "The stray + 1 is the bug", "plan": "Rewrite calc.py and re-run pytest",',
        observation: {
          results: [
            { content: 'Previous response had parsing errors: unterminated object at line 1' }
          ]
        },
        metrics: { prompt_tokens: 388, completion_tokens: 52, cost_usd: 0.0002 }
      },
      {
        step_id: 5,
        timestamp: '2026-01-01T00:00:03.800000+00:00',
        source: 'agent',
        model_name: 'claude-example',
        message:
          'Found it — `add` has a stray `+ 1`. Removing it and re-running the test suite in one ' +
          'batch:\n\n```python\ndef add(a, b):\n    return a + b\n```',
        tool_calls: [
          {
            tool_call_id: 'call_2_1',
            function_name: 'bash_command',
            arguments: {
              keystrokes: "cat << 'EOF' > calc.py\ndef add(a, b):\n    return a + b\nEOF\n",
              duration: 0.1
            }
          },
          {
            tool_call_id: 'call_2_2',
            function_name: 'bash_command',
            arguments: { keystrokes: 'python3 -m pytest -q\n', duration: 1.0 }
          }
        ],
        observation: {
          results: [
            {
              content:
                'New Terminal Output:\nroot@sandbox:/app# python3 -m pytest -q\n1 passed in 0.01s\n'
            }
          ]
        },
        metrics: { prompt_tokens: 640, completion_tokens: 140, cost_usd: 0.00038 }
      },
      {
        step_id: 6,
        timestamp: '2026-01-01T00:00:04.500000+00:00',
        source: 'agent',
        model_name: 'claude-example',
        message: 'All tests pass. Marking the task complete.',
        tool_calls: [
          {
            tool_call_id: 'call_3_1',
            function_name: 'mark_task_complete',
            arguments: {}
          }
        ],
        observation: {
          results: [{ source_call_id: 'call_3_1', content: 'Task marked complete.' }]
        },
        metrics: {
          prompt_tokens: 210,
          completion_tokens: 18,
          cached_tokens: 150,
          cost_usd: 0.00009
        },
        sandbox_id: 'demo-sandbox-1'
      }
    ],
    final_metrics: {
      total_prompt_tokens: 2470,
      total_completion_tokens: 351,
      total_cached_tokens: 150,
      total_cost_usd: 0.00126
    }
  },
  null,
  2
);
