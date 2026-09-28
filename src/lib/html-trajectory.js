/**
 * Converts an exported HTML trajectory viewer page - a self-contained page whose `<script>`
 * embeds the whole trajectory as `const DATA = {…};` - into a trajectory object loadable by
 * `normalizeTrajectory()`.
 *
 * Untrusted input, but never parsed as HTML: the page is treated as a plain string, the object
 * literal after `const DATA =` is located by brace matching and handed to `JSON.parse`. Nothing
 * is inserted into the document, evaluated, or passed to `{@html}`, so no sanitizer is involved
 * and this module stays DOM-free - safe to import from either Vitest project.
 *
 * Embedded shape (every field optional except `steps`):
 * `{ case_id, kind, task, preamble, system_constraint, critic_allegation, critic_step_cited,
 *    cited_ordinals, steps: [{ ordinal, index, number, label, cited, turn, prompts,
 *    blocks: [{ kind, name, text }] }] }`
 * where a block's `kind` is one of `thought`, `call`, `response`, `message`, `user`, `text`.
 */

const DATA_MARKER = /\bconst\s+DATA\s*=\s*/;

// Test runners colour their output with ANSI escape sequences, which read as noise in a
// terminal block that doesn't interpret them.
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

// A `• **key**: value` argument bullet, as tool calls are written in these exports.
const ARG_BULLET_RE = /^[ \t]*•[ \t]*\*\*([^*\n]+)\*\*[ \t]*:[ \t]*/gm;

// Top-level keys handled explicitly below; everything else is passed through untouched so
// `collectMetadata()` surfaces it as a metadata row instead of it silently disappearing.
const HANDLED_TOP_KEYS = new Set(['steps', 'task', 'system_constraint', 'preamble']);
const HANDLED_STEP_KEYS = new Set(['ordinal', 'index', 'number', 'blocks', 'prompts']);

/**
 * @typedef {Object} HtmlTrajectoryBlock
 * @property {string} [kind]
 * @property {string} [name]
 * @property {string} [text]
 */

/**
 * @typedef {Object} HtmlTrajectoryDataStep
 * @property {number} [ordinal]
 * @property {number} [index]
 * @property {number} [number]
 * @property {unknown[]} [prompts]
 * @property {HtmlTrajectoryBlock[]} [blocks]
 */

/**
 * @typedef {Object} HtmlTrajectoryData
 * @property {string} [case_id]
 * @property {string} [task]
 * @property {string} [preamble]
 * @property {string} [system_constraint]
 * @property {HtmlTrajectoryDataStep[]} steps
 */

/**
 * @typedef {Object} ConvertedToolCall
 * @property {string} tool_call_id
 * @property {string} function_name
 * @property {Record<string, unknown>} arguments
 */

/**
 * @typedef {Object} ConvertedToolResult
 * @property {string} content
 * @property {string} [source_call_id]
 */

/**
 * @typedef {Object} ConvertedStep
 * @property {number} step_id
 * @property {string} source
 * @property {string} message
 * @property {ConvertedToolCall[]} [tool_calls]
 * @property {{ results: ConvertedToolResult[] }} [observation]
 */

/**
 * @typedef {Object} ConvertedTrajectory
 * @property {string} schema_version
 * @property {string} session_id
 * @property {{ name: string }} agent
 * @property {ConvertedStep[]} steps
 */

/**
 * @typedef {Object} HtmlTrajectoryOptions
 * @property {string} [sessionId] - Used when the page carries no `case_id`; defaults to a
 *   generated UUID. Pass an explicit value for deterministic tests.
 * @property {string} [agentName] - Defaults to 'html-trajectory'.
 */

/**
 * Returns the index of the `}` that closes the object literal opening at `start`, skipping
 * braces inside JSON strings (including escaped quotes), or -1 if it never closes.
 * @param {string} text
 * @param {number} start - Index of the opening `{`.
 * @returns {number}
 */
function findObjectEnd(text, start) {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Locates and parses the `const DATA = {…}` object embedded in an exported trajectory page.
 * @param {string} html
 * @returns {HtmlTrajectoryData}
 */
export function extractTrajectoryData(html) {
  if (!html || !html.trim()) throw new Error('Paste some HTML first.');

  const marker = DATA_MARKER.exec(html);
  if (!marker) {
    throw new Error(
      'No embedded trajectory found. Expected a <script> containing "const DATA = {…}".'
    );
  }
  const start = marker.index + marker[0].length;
  if (html[start] !== '{') {
    throw new Error('The embedded "const DATA" is not an object literal.');
  }
  const end = findObjectEnd(html, start);
  if (end === -1) {
    throw new Error('The embedded "const DATA" object is incomplete - was the file truncated?');
  }

  /** @type {unknown} */
  let data;
  try {
    data = JSON.parse(html.slice(start, end + 1));
  } catch (err) {
    throw new Error(
      `The embedded "const DATA" object is not valid JSON: ${/** @type {Error} */ (err).message}`,
      { cause: err }
    );
  }
  if (!data || typeof data !== 'object' || !Array.isArray(/** @type {any} */ (data).steps)) {
    throw new Error('The embedded "const DATA" object has no "steps" array.');
  }
  return /** @type {HtmlTrajectoryData} */ (data);
}

/**
 * Strips one outer fenced code block (```lang\n...\n```), returning the input unchanged when
 * there is none.
 * @param {string} text
 * @returns {string}
 */
function stripOuterFence(text) {
  const match = /^[ \t]*```[^\n]*\n([\s\S]*?)\n?[ \t]*```[ \t]*$/.exec(text.trim());
  return match ? match[1] : text.trim();
}

/**
 * @param {string} value
 * @returns {string}
 */
function unwrapArgumentValue(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('```')) return stripOuterFence(trimmed);
  const inline = /^`([^`]*)`$/.exec(trimmed);
  return inline ? inline[1] : trimmed;
}

/**
 * Parses a tool call block written as `• **key**: value` bullets. A value is either inline
 * (optionally wrapped in single backticks) or a fenced block on the following lines. Text that
 * doesn't use the bullet format is kept whole under a single `text` argument.
 * @param {string} text
 * @returns {Record<string, unknown>}
 */
export function parseCallArguments(text) {
  // Object.create(null) so a key of "__proto__" lands as a plain own key instead of hitting the
  // prototype setter and silently vanishing (or worse, polluting the prototype).
  const args = /** @type {Record<string, unknown>} */ (Object.create(null));
  const source = text ?? '';
  const matches = Array.from(source.matchAll(ARG_BULLET_RE));
  if (matches.length === 0) {
    if (source.trim()) args.text = source.trim();
    return args;
  }
  matches.forEach((match, i) => {
    const valueStart = /** @type {number} */ (match.index) + match[0].length;
    const valueEnd = i + 1 < matches.length ? matches[i + 1].index : source.length;
    args[match[1].trim()] = unwrapArgumentValue(source.slice(valueStart, valueEnd));
  });
  return args;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function textOf(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Builds the leading user step from the page-level task fields, or null when there are none.
 * @param {HtmlTrajectoryData} data
 * @returns {ConvertedStep | null}
 */
function taskStep(data) {
  const sections = [];
  const constraints = textOf(data.system_constraint);
  const preamble = textOf(data.preamble);
  const task = textOf(data.task);
  if (constraints) sections.push(`## System constraints\n\n${constraints}`);
  if (preamble) sections.push(`## Preamble\n\n${preamble}`);
  if (task) sections.push(`## Task\n\n${task}`);
  if (sections.length === 0) return null;
  return { step_id: 0, source: 'user', message: sections.join('\n\n') };
}

/**
 * @param {HtmlTrajectoryDataStep} raw
 * @param {number} i
 * @returns {ConvertedStep}
 */
function convertStep(raw, i) {
  const obj = raw && typeof raw === 'object' ? raw : {};
  const stepId = [obj.ordinal, obj.number, obj.index].find((n) => typeof n === 'number') ?? i + 1;
  const blocks = Array.isArray(obj.blocks) ? obj.blocks : [];

  const prose = [];
  /** @type {ConvertedToolCall[]} */
  const toolCalls = [];
  /** @type {ConvertedToolResult[]} */
  const results = [];
  /** @type {HtmlTrajectoryBlock[]} */
  const extraBlocks = [];

  for (const block of blocks) {
    const kind = block?.kind;
    const text = typeof block?.text === 'string' ? block.text : '';
    if (kind === 'thought' || kind === 'message') {
      if (text.trim()) prose.push(text.trim());
    } else if (kind === 'call') {
      toolCalls.push({
        tool_call_id: `call_${stepId}_${toolCalls.length + 1}`,
        function_name: textOf(block.name) || 'unknown',
        arguments: parseCallArguments(text)
      });
    } else if (kind === 'response') {
      results.push({ content: stripOuterFence(text.replace(ANSI_RE, '')) });
    } else {
      extraBlocks.push(block);
    }
  }

  // Pair responses with calls first-in-first-out; a response with no call left keeps no id.
  results.forEach((result, n) => {
    if (toolCalls[n]) result.source_call_id = toolCalls[n].tool_call_id;
  });

  /** @type {ConvertedStep & Record<string, unknown>} */
  const step = { step_id: stepId, source: 'agent', message: prose.join('\n\n') };
  if (toolCalls.length > 0) step.tool_calls = toolCalls;
  if (results.length > 0) step.observation = { results };
  for (const [key, value] of Object.entries(obj)) {
    if (!HANDLED_STEP_KEYS.has(key)) step[key] = value;
  }
  if (Array.isArray(obj.prompts) && obj.prompts.length > 0) step.prompts = obj.prompts;
  if (extraBlocks.length > 0) step.extra_blocks = extraBlocks;
  return step;
}

/**
 * Converts an exported HTML trajectory page into a trajectory object shaped for
 * `normalizeTrajectory()`: the task (with any system constraints) becomes a leading `user` step
 * 0, and each embedded step becomes an `agent` step whose thoughts/messages form the message,
 * `call` blocks the tool calls and `response` blocks the observation. Page-level extras (critic
 * notes, cited steps, ...) and per-step extras (label, turn, cited, non-empty prompts) are kept
 * as unknown keys, which the viewer renders as metadata.
 * @param {string} html
 * @param {HtmlTrajectoryOptions} [options]
 * @returns {ConvertedTrajectory}
 */
export function htmlTrajectoryToTrajectory(html, options = {}) {
  const data = extractTrajectoryData(html);

  /** @type {ConvertedStep[]} */
  const steps = [];
  const first = taskStep(data);
  if (first) steps.push(first);
  data.steps.forEach((raw, i) => steps.push(convertStep(raw, i)));

  if (steps.length === 0) {
    throw new Error('Nothing to convert - the embedded trajectory has no steps.');
  }

  /** @type {Record<string, unknown>} */
  const passthrough = {};
  for (const [key, value] of Object.entries(data)) {
    if (!HANDLED_TOP_KEYS.has(key)) passthrough[key] = value;
  }

  return {
    schema_version: 'html-trajectory-v1',
    session_id:
      typeof data.case_id === 'string' && data.case_id
        ? data.case_id
        : (options.sessionId ?? crypto.randomUUID()),
    agent: { name: options.agentName ?? 'html-trajectory' },
    ...passthrough,
    steps
  };
}

const EXAMPLE_DATA = {
  case_id: 'example-case-001',
  kind: 'trajectory',
  task: 'Fix the failing test in `calc.py`: `test_add` expects `add(2, 2)` to return 4, but the current implementation returns 5.',
  preamble: '',
  system_constraint: '• Fix the root cause without weakening tests.',
  critic_allegation:
    'The agent edited `calc.py` in step 3 without re-reading it first (an example note - nothing here is real).',
  critic_step_cited: 'Step 3',
  cited_ordinals: [3],
  steps: [
    {
      ordinal: 1,
      label: 'Step 1',
      cited: false,
      turn: 1,
      prompts: [],
      blocks: [
        { kind: 'thought', name: '', text: 'I will inspect `calc.py` to find the bug.' },
        { kind: 'call', name: 'shell', text: '• **instruction**: `cat calc.py`' },
        {
          kind: 'response',
          name: 'shell',
          text: '```\ndef add(a, b):\n    return a + b + 1  # note: { unbalanced brace in a string }\n```'
        }
      ]
    },
    {
      ordinal: 2,
      label: 'Step 2',
      cited: false,
      turn: 1,
      prompts: [{ turn: 1, kind: 'user', text: 'Please keep the fix minimal.' }],
      blocks: [
        { kind: 'thought', name: '', text: 'The stray `+ 1` is the bug. Rewriting the function.' },
        {
          kind: 'call',
          name: 'shell',
          text: "• **instruction**:\n```\ncat << 'EOF' > calc.py\ndef add(a, b):\n    return a + b\nEOF\n```"
        },
        { kind: 'response', name: 'shell', text: '```\nCommand exited with status 0\n```' }
      ]
    },
    {
      ordinal: 3,
      label: 'Step 3',
      cited: true,
      turn: 1,
      prompts: [],
      blocks: [
        { kind: 'thought', name: '', text: 'Running the test suite to confirm the fix.' },
        { kind: 'call', name: 'shell', text: '• **instruction**: `python3 -m pytest -q`' },
        { kind: 'response', name: 'shell', text: '```\n1 passed in 0.01s\n```' }
      ]
    },
    {
      ordinal: 4,
      label: 'Step 4',
      cited: false,
      turn: 1,
      prompts: [],
      blocks: [
        {
          kind: 'message',
          name: '',
          text: 'Removed the stray `+ 1` from `add`; the test suite passes.'
        }
      ]
    }
  ]
};

/**
 * A small, fictional exported page bundled for the import modal's "Load example" button. It
 * exercises every branch of the converter: task + constraints, thought / call (inline and
 * fenced argument) / response / message blocks, a cited step, a non-empty `prompts` list, and a
 * `}` inside a JSON string that the brace matcher must skip. The `<\/` escape mirrors how such
 * pages keep a `</script>` inside the data from closing the script early.
 */
export const EXAMPLE_TRAJECTORY_HTML = `<!doctype html>
<html>
<head><title>Trajectory</title></head>
<body>
<div id="app"></div>
<script>
const DATA = ${JSON.stringify(EXAMPLE_DATA).replace(/<\//g, '<\\/')};

const KIND = { thought: 'assistant thought' };
</script>
</body>
</html>
`;
