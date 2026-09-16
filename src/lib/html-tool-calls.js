import DOMPurify from 'dompurify';

/**
 * Converts an exported HTML tool-call transcript (see `tool_calls-structure.html` in the repo
 * root) into a trajectory object loadable by `normalizeTrajectory()`. A browser port of
 * `convert_tool_calls.py`, kept behaviorally identical except where noted.
 *
 * Untrusted input: the pasted HTML is sanitized with DOMPurify into a detached, structure-only
 * fragment *before* anything reads it — same guardrail as `htmlToMarkdown()` in
 * `html-to-markdown.js`. The fragment is only ever read (textContent / querySelector /
 * querySelectorAll), never inserted into the live document and never passed to `{@html}`.
 */

const ALLOWED_TAGS = [
  'details',
  'summary',
  'div',
  'span',
  'p',
  'pre',
  'code',
  'br',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'section',
  'article',
  'main',
  'header',
  'footer',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
  'strong',
  'b',
  'em',
  'i',
  'a',
  'small'
];

// `class` drives every selector below and `id` drives segment ordering — both are inert once
// read: the sanitized fragment is only ever queried/read, never inserted into the document.
const ALLOWED_ATTR = ['class', 'id'];

const BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'div',
  'dl',
  'fieldset',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'ul'
]);

const NUMERIC_RE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

/**
 * Recovers displayed JSON scalars/containers while leaving normal text alone.
 * @param {string} value
 * @returns {unknown}
 */
function decodeArgument(value) {
  const stripped = value.trim();
  const looksLikeJson =
    (stripped.startsWith('{') && stripped.endsWith('}')) ||
    (stripped.startsWith('[') && stripped.endsWith(']')) ||
    stripped === 'true' ||
    stripped === 'false' ||
    stripped === 'null' ||
    NUMERIC_RE.test(stripped);
  if (looksLikeJson) {
    try {
      return JSON.parse(stripped);
    } catch {
      // fall through - keep the original text
    }
  }
  return value;
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeText(value) {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Turns rendered transcript HTML into readable plain text, matching `readable_text()` in
 * convert_tool_calls.py: `<br>` becomes a line break, `<li>` becomes a dash-prefixed line, and
 * other block tags get a trailing blank line.
 * @param {Node} node
 * @returns {string}
 */
function readableText(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const element = /** @type {Element} */ (node);
  const tag = element.tagName.toLowerCase();
  if (tag === 'br') return '\n';
  const content = Array.from(element.childNodes)
    .map((child) => readableText(child))
    .join('');
  if (tag === 'li') return `- ${content.trim()}\n`;
  if (BLOCK_TAGS.has(tag)) return `${content.replace(/\s+$/, '')}\n\n`;
  return content;
}

/**
 * @param {Element} root
 * @param {string} className
 * @returns {Element | null}
 */
function firstByClass(root, className) {
  if (root.classList?.contains(className)) return root;
  return root.querySelector(`.${className}`);
}

/**
 * @param {Element} segment
 * @returns {Set<string>}
 */
function classesOf(segment) {
  return new Set(segment.className.split(/\s+/).filter(Boolean));
}

/**
 * Orders transcript segments by the trailing digits of their `id` (matching
 * `segment_nodes()`/`order()` in the Python converter), keeping document order as the tiebreak
 * for id-less or duplicate-id segments.
 * @param {DocumentFragment} fragment
 * @returns {Element[]}
 */
function segments(fragment) {
  const nodes = Array.from(fragment.querySelectorAll('details.seg'));
  return nodes
    .map((node, index) => {
      const match = /(\d+)$/.exec(node.getAttribute('id') ?? '');
      const key = match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
      return { node, index, key };
    })
    .sort((a, b) => a.key - b.key || a.index - b.index)
    .map(({ node }) => node);
}

/**
 * @param {Element} segment
 * @returns {{ name: string, arguments: Record<string, unknown> }}
 */
function parseToolCall(segment) {
  const header = firstByClass(segment, 'invoke-hdr');
  let name;
  if (header) {
    name = normalizeText(header.textContent ?? '').replace(/^[^\w./:-]+\s*/, '');
  } else {
    const role = firstByClass(segment, 'role');
    const roleText = role?.textContent ?? '';
    const match = /tool call\s*[·|:-]\s*([^·|]+)/i.exec(roleText);
    name = match ? match[1].trim() : 'unknown_tool';
  }

  // Object.create(null) so a `.pn` of "__proto__" lands as a plain own key instead of hitting
  // the prototype setter and silently vanishing (or worse, polluting the prototype).
  const args = /** @type {Record<string, unknown>} */ (Object.create(null));
  for (const param of Array.from(segment.querySelectorAll('.invoke-param'))) {
    const keyNode = firstByClass(param, 'pn');
    const valueNode = firstByClass(param, 'pv');
    if (!keyNode || !valueNode) continue;
    const key = normalizeText(keyNode.textContent ?? '');
    const value = normalizeText(valueNode.textContent ?? '');
    args[key] = decodeArgument(value);
  }
  return { name, arguments: args };
}

/**
 * @param {Element} segment
 * @returns {string}
 */
function parseToolResult(segment) {
  const target = segment.querySelector('pre') ?? firstByClass(segment, 'body') ?? segment;
  return (target.textContent ?? '').replace(/^[\r\n]+/, '').replace(/[\r\n]+$/, '');
}

/**
 * @param {Element} segment
 * @returns {string}
 */
function parseMessage(segment) {
  const body = firstByClass(segment, 'body') ?? segment;
  return normalizeText(readableText(body));
}

/**
 * @typedef {Object} HtmlToolCallsOptions
 * @property {string} [sessionId] - Defaults to a generated UUID; pass an explicit value for
 *   deterministic tests.
 * @property {string} [agentName] - Defaults to 'html-transcript', matching the Python CLI.
 */

/**
 * @typedef {Object} HtmlToolCall
 * @property {string} tool_call_id
 * @property {string} function_name
 * @property {Record<string, unknown>} arguments
 */

/**
 * @typedef {Object} HtmlToolResult
 * @property {string} content
 * @property {string} [source_call_id]
 */

/**
 * @typedef {Object} HtmlTrajectoryStep
 * @property {number} step_id
 * @property {string} source
 * @property {string} message
 * @property {HtmlToolCall[]} [tool_calls]
 * @property {{ results: HtmlToolResult[] }} [observation]
 */

/**
 * @typedef {Object} HtmlTrajectory
 * @property {string} schema_version
 * @property {string} session_id
 * @property {{ name: string }} agent
 * @property {HtmlTrajectoryStep[]} steps
 */

/**
 * Converts a sanitized HTML transcript into a trajectory object shaped for
 * `normalizeTrajectory()` (see `agent-trajectory.js`): `schema_version`, `session_id`, `agent`,
 * and a `steps` array of `{ step_id, source, message, tool_calls?, observation? }`.
 * @param {string} html
 * @param {HtmlToolCallsOptions} [options]
 * @returns {HtmlTrajectory}
 */
export function htmlToTrajectory(html, options = {}) {
  if (!html || !html.trim()) throw new Error('Paste some HTML first.');
  if (!DOMPurify.isSupported)
    throw new Error('HTML sanitization is not available in this environment.');

  const fragment = /** @type {DocumentFragment} */ (
    DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR, RETURN_DOM_FRAGMENT: true })
  );

  const segmentNodes = segments(fragment);
  if (segmentNodes.length === 0) {
    throw new Error(
      'No transcript segments found. Expected <details class="seg …"> elements — see tool_calls-structure.html.'
    );
  }

  /** @type {HtmlTrajectoryStep[]} */
  const steps = [];
  /** @type {HtmlTrajectoryStep[]} */
  const unmatchedCallSteps = [];
  let callNumber = 0;

  for (const segment of segmentNodes) {
    const kind = classesOf(segment);
    if (kind.has('tool_call')) {
      const { name, arguments: args } = parseToolCall(segment);
      callNumber += 1;
      const callId = `call_${callNumber}`;
      /** @type {HtmlTrajectoryStep} */
      const step = {
        step_id: steps.length + 1,
        source: 'agent',
        message: '',
        tool_calls: [{ tool_call_id: callId, function_name: name, arguments: args }]
      };
      steps.push(step);
      unmatchedCallSteps.push(step);
    } else if (kind.has('tool_result')) {
      /** @type {HtmlToolResult} */
      const result = { content: parseToolResult(segment) };
      const callStep = unmatchedCallSteps.shift();
      if (callStep) {
        const toolCalls = /** @type {HtmlToolCall[]} */ (callStep.tool_calls);
        result.source_call_id = toolCalls[0].tool_call_id;
        callStep.observation = { results: [result] };
      } else {
        steps.push({
          step_id: steps.length + 1,
          source: 'agent',
          message: '',
          observation: { results: [result] }
        });
      }
    } else {
      const role = kind.has('assistant')
        ? 'agent'
        : kind.has('user')
          ? 'user'
          : kind.has('system')
            ? 'system'
            : null;
      if (role) {
        const message = parseMessage(segment);
        if (message) steps.push({ step_id: steps.length + 1, source: role, message });
      }
    }
  }

  if (steps.length === 0) {
    throw new Error('Nothing to convert — the pasted HTML had no readable segments.');
  }

  return {
    schema_version: 'html-tool-calls-v1',
    session_id: options.sessionId ?? crypto.randomUUID(),
    agent: { name: options.agentName ?? 'html-transcript' },
    steps
  };
}

/**
 * A small transcript bundled for the import modal's "Load example" button. Mirrors the shape in
 * `tool_calls-structure.html` and exercises every branch of the converter: a user message, an
 * assistant message with list/paragraph structure, a tool call with a JSON-object argument and
 * a plain string argument, and both of their FIFO-matched results.
 */
export const EXAMPLE_TOOL_CALLS_HTML = `<div class="main">
  <details class="seg user" id="seg-0">
    <summary><span class="role">user</span><span>#0</span></summary>
    <div class="body md">
      <p>The tests in <code>calc.py</code> are failing. Can you take a look?</p>
    </div>
  </details>

  <details class="seg assistant" id="seg-1">
    <summary><span class="role">assistant</span><span>#1</span></summary>
    <div class="body md">
      <p>Sure — I'll start by inspecting the file, then run the test suite.</p>
      <ul>
        <li>Read calc.py</li>
        <li>Run pytest</li>
      </ul>
    </div>
  </details>

  <details class="seg tool_call" id="seg-2" open>
    <summary><span class="role">tool call</span><span>#2</span></summary>
    <div class="body tool">
      <div class="invoke-card">
        <div class="invoke-hdr">read_file</div>
        <div class="invoke-param">
          <div class="pn">path</div>
          <div class="pv">calc.py</div>
        </div>
        <div class="invoke-param">
          <div class="pn">options</div>
          <div class="pv">{"encoding": "utf-8", "max_lines": 200}</div>
        </div>
      </div>
    </div>
  </details>

  <details class="seg tool_result" id="seg-3">
    <summary><span class="role">tool result</span><span>#3</span></summary>
    <div class="body tool">
      <pre class="tr-pre">def add(a, b):
    return a + b + 1
</pre>
    </div>
  </details>

  <details class="seg tool_call" id="seg-4" open>
    <summary><span class="role">tool call</span><span>#4</span></summary>
    <div class="body tool">
      <div class="invoke-card">
        <div class="invoke-hdr">bash_command</div>
        <div class="invoke-param">
          <div class="pn">keystrokes</div>
          <div class="pv">pytest -q</div>
        </div>
      </div>
    </div>
  </details>

  <details class="seg tool_result" id="seg-5">
    <summary><span class="role">tool result</span><span>#5</span></summary>
    <div class="body tool">
      <pre class="tr-pre">FAILED test_calc.py::test_add - assert 5 == 4</pre>
    </div>
  </details>
</div>
`;
