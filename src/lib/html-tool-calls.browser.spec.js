import DOMPurify from 'dompurify';
import { describe, expect, it } from 'vitest';
import { htmlToTrajectory, EXAMPLE_TOOL_CALLS_HTML } from './html-tool-calls.js';
import { normalizeTrajectory } from './agent-trajectory.js';

const STRUCTURE_HTML = `<div class="main">
  <details class="seg user" id="seg-0">
    <summary><span class="role">user</span><span>#0</span></summary>
    <div class="body md">
      <p>[user message]</p>
    </div>
  </details>

  <details class="seg assistant" id="seg-1">
    <summary><span class="role">assistant</span><span>#1</span></summary>
    <div class="body md">
      <p>[assistant message]</p>
    </div>
  </details>

  <details class="seg tool_call" id="seg-2" open>
    <summary><span class="role">tool call</span><span>#2</span></summary>
    <div class="body tool">
      <div class="invoke-card">
        <div class="invoke-hdr">[tool_name]</div>
        <div class="invoke-param">
          <div class="pn">[argument_name]</div>
          <div class="pv">[argument_value]</div>
        </div>
        <div class="invoke-param">
          <div class="pn">[another_argument_name]</div>
          <div class="pv">[another_argument_value]</div>
        </div>
      </div>
    </div>
  </details>

  <details class="seg tool_result" id="seg-3">
    <summary><span class="role">tool result</span><span>#3</span></summary>
    <div class="body tool">
      <pre class="tr-pre">[tool result text]</pre>
    </div>
  </details>
</div>
`;

describe('htmlToTrajectory', () => {
  // Sanitization (and therefore the whole converter) only works with a real `window` - see the
  // AGENTS.md note on why XSS/sanitization suites must run as .browser.spec.js. This guards
  // against the file silently landing in the wrong Vitest project.
  it('uses browser-backed sanitization', () => {
    expect(DOMPurify.isSupported).toBe(true);
  });

  it('throws when the input is blank', () => {
    expect(() => htmlToTrajectory('   ')).toThrow('Paste some HTML first.');
  });

  it('throws when no transcript segments are found', () => {
    expect(() => htmlToTrajectory('<p>just a paragraph, no segments</p>')).toThrow(
      'No transcript segments found'
    );
  });

  it('throws when segments carry no readable content', () => {
    expect(() => htmlToTrajectory('<details class="seg assistant" id="seg-0"></details>')).toThrow(
      'Nothing to convert — the pasted HTML had no readable segments.'
    );
  });

  it('converts the reference tool_calls-structure.html shape', () => {
    const trajectory = htmlToTrajectory(STRUCTURE_HTML, { sessionId: 'test-session' });

    expect(trajectory.schema_version).toBe('html-tool-calls-v1');
    expect(trajectory.session_id).toBe('test-session');
    expect(trajectory.agent).toEqual({ name: 'html-transcript' });
    expect(trajectory.steps).toHaveLength(3);

    const [userStep, assistantStep, callStep] = trajectory.steps;
    expect(userStep).toMatchObject({ source: 'user', message: '[user message]' });
    expect(assistantStep).toMatchObject({ source: 'agent', message: '[assistant message]' });

    // The leading "[" is stripped as header junk (same regex as convert_tool_calls.py); this
    // fixture's bracketed placeholders are a mock-transcript convention, not literal tool names.
    expect(callStep.tool_calls).toEqual([
      {
        tool_call_id: 'call_1',
        function_name: 'tool_name]',
        arguments: {
          '[argument_name]': '[argument_value]',
          '[another_argument_name]': '[another_argument_value]'
        }
      }
    ]);
    expect(callStep.observation?.results).toEqual([
      { content: '[tool result text]', source_call_id: 'call_1' }
    ]);
  });

  it('attaches consecutive results to consecutive calls in FIFO order', () => {
    const html = `
      <details class="seg tool_call" id="seg-0"><div class="invoke-hdr">first</div></details>
      <details class="seg tool_call" id="seg-1"><div class="invoke-hdr">second</div></details>
      <details class="seg tool_result" id="seg-2"><pre>result A</pre></details>
      <details class="seg tool_result" id="seg-3"><pre>result B</pre></details>
    `;
    const trajectory = htmlToTrajectory(html);
    const [first, second] = trajectory.steps;
    expect(first.tool_calls?.[0].tool_call_id).toBe('call_1');
    expect(first.observation?.results[0]).toEqual({
      content: 'result A',
      source_call_id: 'call_1'
    });
    expect(second.tool_calls?.[0].tool_call_id).toBe('call_2');
    expect(second.observation?.results[0]).toEqual({
      content: 'result B',
      source_call_id: 'call_2'
    });
  });

  it('turns an orphan tool_result with no unmatched call into its own step', () => {
    const html = `<details class="seg tool_result" id="seg-0"><pre>orphaned</pre></details>`;
    const trajectory = htmlToTrajectory(html);
    expect(trajectory.steps).toHaveLength(1);
    expect(trajectory.steps[0]).toMatchObject({
      source: 'agent',
      message: '',
      observation: { results: [{ content: 'orphaned' }] }
    });
    expect(trajectory.steps[0].observation?.results[0].source_call_id).toBeUndefined();
  });

  it.each([
    ['{"a":1}', { a: 1 }],
    ['[1,2]', [1, 2]],
    ['42', 42],
    ['true', true],
    ['false', false],
    ['null', null],
    ['hello', 'hello'],
    ['{oops', '{oops']
  ])('decodes argument %s as %j', (raw, expected) => {
    const html = `<details class="seg tool_call" id="seg-0">
      <div class="invoke-hdr">t</div>
      <div class="invoke-param"><div class="pn">v</div><div class="pv">${raw}</div></div>
    </details>`;
    const trajectory = htmlToTrajectory(html);
    expect(trajectory.steps[0].tool_calls?.[0].arguments.v).toEqual(expected);
  });

  it('strips leading emoji/junk from the tool header and falls back to the role text', () => {
    const withHeader = htmlToTrajectory(
      '<details class="seg tool_call" id="seg-0"><div class="invoke-hdr">🔧 Bash</div></details>'
    );
    expect(withHeader.steps[0].tool_calls?.[0].function_name).toBe('Bash');

    const withoutHeader = htmlToTrajectory(
      '<details class="seg tool_call" id="seg-0"><span class="role">tool call · run_tests</span></details>'
    );
    expect(withoutHeader.steps[0].tool_calls?.[0].function_name).toBe('run_tests');
  });

  it('renders list items and line breaks as readable text', () => {
    const html = `<details class="seg assistant" id="seg-0">
      <div class="body"><p>Plan</p><ul><li>step one</li><li>step two</li></ul><p>Done<br>for now</p></div>
    </details>`;
    const trajectory = htmlToTrajectory(html);
    expect(trajectory.steps[0].message).toBe('Plan\n\n- step one\n- step two\n\nDone\nfor now');
  });

  it('orders segments by the trailing digits of id regardless of document order', () => {
    const html = `
      <details class="seg assistant" id="seg-2"><div class="body">third</div></details>
      <details class="seg assistant" id="seg-0"><div class="body">first</div></details>
      <details class="seg assistant" id="seg-1"><div class="body">second</div></details>
    `;
    const trajectory = htmlToTrajectory(html);
    expect(trajectory.steps.map((s) => s.message)).toEqual(['first', 'second', 'third']);
  });

  describe('security', () => {
    it('strips <script> content from a tool-call argument', () => {
      const html = `<details class="seg tool_call" id="seg-0">
        <div class="invoke-hdr">t</div>
        <div class="invoke-param"><div class="pn">v</div><div class="pv"><script>alert(1)</script>payload</div></div>
      </details>`;
      const trajectory = htmlToTrajectory(html);
      const serialized = JSON.stringify(trajectory);
      expect(serialized).not.toContain('<script>');
      expect(serialized).not.toContain('alert(1)');
      expect(serialized).toContain('payload');
    });

    it('strips inline event handlers from message bodies', () => {
      const html = `<details class="seg assistant" id="seg-0">
        <div class="body"><img src="x" onerror="alert(1)"><p>safe</p></div>
      </details>`;
      const trajectory = htmlToTrajectory(html);
      const serialized = JSON.stringify(trajectory);
      expect(serialized).not.toContain('onerror');
      expect(serialized).not.toContain('alert');
      expect(serialized).toContain('safe');
    });

    it('removes iframes, styles, inline SVG scripts and javascript: links entirely', () => {
      const html = `<details class="seg assistant" id="seg-0">
        <div class="body">
          <iframe src="https://evil.example"></iframe>
          <style>body{background:red}</style>
          <svg onload="alert(1)"></svg>
          <a href="javascript:alert(1)">click</a>
          <p>safe text</p>
        </div>
      </details>`;
      const trajectory = htmlToTrajectory(html);
      const serialized = JSON.stringify(trajectory);
      expect(serialized).not.toContain('evil.example');
      expect(serialized).not.toContain('background:red');
      expect(serialized).not.toContain('onload');
      expect(serialized).not.toContain('alert(1)');
      expect(serialized).not.toContain('javascript:');
      expect(serialized).toContain('safe text');
    });

    it('never inserts the sanitized fragment into the live document', () => {
      htmlToTrajectory(
        '<details class="seg assistant" id="seg-0"><div class="body" data-xss-probe="1">hi</div></details>'
      );
      expect(document.querySelector('[data-xss-probe]')).toBeNull();
    });

    it('treats a __proto__ argument name as a plain own key, not prototype pollution', () => {
      const html = `<details class="seg tool_call" id="seg-0">
        <div class="invoke-hdr">t</div>
        <div class="invoke-param"><div class="pn">__proto__</div><div class="pv">{"polluted": true}</div></div>
      </details>`;
      const trajectory = htmlToTrajectory(html);
      const args = trajectory.steps[0].tool_calls?.[0].arguments;
      expect(Object.prototype.hasOwnProperty.call(args, '__proto__')).toBe(true);
      expect(/** @type {{ polluted?: boolean }} */ ({}).polluted).toBeUndefined();
    });
  });

  it('round-trips through normalizeTrajectory cleanly', () => {
    const trajectory = htmlToTrajectory(EXAMPLE_TOOL_CALLS_HTML, { sessionId: 'example-session' });
    const normalized = normalizeTrajectory(JSON.parse(JSON.stringify(trajectory)));

    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;
    expect(normalized.schemaVersion).toBe('html-tool-calls-v1');
    expect(normalized.steps.length).toBe(trajectory.steps.length);

    const functionNames = normalized.steps.flatMap((step) =>
      step.toolCalls.map((call) => call.functionName)
    );
    expect(functionNames).toEqual(['read_file', 'bash_command']);

    const resultsWithSource = normalized.steps.flatMap((step) => step.stepObservations);
    expect(resultsWithSource.every((r) => typeof r.sourceCallId === 'string')).toBe(true);
  });
});
