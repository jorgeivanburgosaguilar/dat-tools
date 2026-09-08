import { describe, it, expect } from 'vitest';
import {
  collectMetadata,
  metricEntries,
  linkObservations,
  splitObservation,
  noticeLevel,
  detectStepLevel,
  isTaskCompleteStep,
  recoverJsonFields,
  parseStructuredMessage,
  normalizeTrajectory,
  stepSummary,
  deltaMs,
  formatDelta,
  trajectoryStats,
  buildSearchIndex,
  filterSteps,
  EXAMPLE_TRAJECTORY
} from './agent-trajectory.js';

describe('collectMetadata', () => {
  it('returns an entry for every key not in knownKeys', () => {
    const entries = collectMetadata({ a: 1, b: 2, c: 3 }, ['a']);
    expect(entries.map((e) => e.path).sort()).toEqual(['b', 'c']);
  });

  it('flattens a plain nested object into dotted paths', () => {
    const entries = collectMetadata({ extra: { parser: 'xml', depth: 2 } }, []);
    expect(entries).toEqual(
      expect.arrayContaining([
        { path: 'extra.parser', value: 'xml', isJson: false },
        { path: 'extra.depth', value: '2', isJson: false }
      ])
    );
  });

  it('flattens arbitrarily deep nested objects', () => {
    const entries = collectMetadata({ a: { b: { c: 'deep' } } }, []);
    expect(entries).toEqual([{ path: 'a.b.c', value: 'deep', isJson: false }]);
  });

  it('stringifies arrays as JSON rather than flattening them', () => {
    const entries = collectMetadata({ tags: ['x', 'y'] }, []);
    expect(entries).toEqual([
      { path: 'tags', value: JSON.stringify(['x', 'y'], null, 2), isJson: true }
    ]);
  });

  it('renders null and undefined as the literal string "null"', () => {
    const entries = collectMetadata({ a: null, b: undefined }, []);
    expect(entries.find((e) => e.path === 'a')).toEqual({
      path: 'a',
      value: 'null',
      isJson: false
    });
    expect(entries.find((e) => e.path === 'b')).toEqual({
      path: 'b',
      value: 'null',
      isJson: false
    });
  });

  it('returns an empty array for non-object input', () => {
    expect(collectMetadata(null)).toEqual([]);
    expect(collectMetadata('a string')).toEqual([]);
    expect(collectMetadata(42)).toEqual([]);
    expect(collectMetadata(['a', 'b'])).toEqual([]);
  });
});

describe('metricEntries', () => {
  it('builds one entry per key with a display string', () => {
    const entries = metricEntries({ prompt_tokens: 1395, completion_tokens: 146 });
    expect(entries).toEqual([
      { key: 'prompt_tokens', value: 1395, display: '1,395' },
      { key: 'completion_tokens', value: 146, display: '146' }
    ]);
  });

  it('formats a *cost* key as currency, trimming trailing zeros', () => {
    const entries = metricEntries({ cost_usd: 4.70788825 });
    expect(entries[0].display).toBe('$4.707888');
  });

  it('formats a zero cost as $0.00', () => {
    const entries = metricEntries({ cost_usd: 0 });
    expect(entries[0].display).toBe('$0.00');
  });

  it('returns an empty array for a missing or non-object metrics field', () => {
    expect(metricEntries(undefined)).toEqual([]);
    expect(metricEntries(null)).toEqual([]);
    expect(metricEntries('nope')).toEqual([]);
  });

  it('tolerates metrics that omit cached_tokens', () => {
    const entries = metricEntries({ prompt_tokens: 10, completion_tokens: 2, cost_usd: 0.01 });
    expect(entries.map((e) => e.key)).toEqual(['prompt_tokens', 'completion_tokens', 'cost_usd']);
  });
});

describe('linkObservations', () => {
  it('attaches a result to the tool call whose id matches source_call_id', () => {
    const toolCalls = [
      {
        toolCallId: 'call_1',
        functionName: 'bash_command',
        codeArgs: [],
        metadata: [],
        observations: []
      }
    ];
    const results = /** @type {import('./agent-trajectory.js').ObservationResult[]} */ ([
      {
        sourceCallId: 'call_1',
        content: 'output',
        metadata: [],
        notice: '',
        marker: null,
        terminal: 'output',
        level: 'ok'
      }
    ]);
    const { toolCalls: linked, stepObservations } = linkObservations(toolCalls, results);
    expect(linked[0].observations).toEqual(results);
    expect(stepObservations).toEqual([]);
  });

  it('falls back to stepObservations when source_call_id is absent, for a multi-tool-call step', () => {
    const toolCalls = [
      { toolCallId: 'call_1', functionName: 'a', codeArgs: [], metadata: [], observations: [] },
      { toolCallId: 'call_2', functionName: 'b', codeArgs: [], metadata: [], observations: [] }
    ];
    const results = /** @type {import('./agent-trajectory.js').ObservationResult[]} */ ([
      {
        sourceCallId: null,
        content: 'merged output',
        metadata: [],
        notice: '',
        marker: null,
        terminal: 'merged output',
        level: 'ok'
      }
    ]);
    const { toolCalls: linked, stepObservations } = linkObservations(toolCalls, results);
    expect(linked[0].observations).toEqual([]);
    expect(linked[1].observations).toEqual([]);
    expect(stepObservations).toEqual(results);
  });

  it('falls back to stepObservations when source_call_id references an id not present in this step', () => {
    const toolCalls = [
      { toolCallId: 'call_1', functionName: 'a', codeArgs: [], metadata: [], observations: [] }
    ];
    const results = /** @type {import('./agent-trajectory.js').ObservationResult[]} */ ([
      {
        sourceCallId: 'call_unknown',
        content: 'x',
        metadata: [],
        notice: '',
        marker: null,
        terminal: 'x',
        level: 'ok'
      }
    ]);
    const { stepObservations } = linkObservations(toolCalls, results);
    expect(stepObservations).toEqual(results);
  });

  it('does not mutate the input tool call objects', () => {
    const toolCalls = [
      { toolCallId: 'call_1', functionName: 'a', codeArgs: [], metadata: [], observations: [] }
    ];
    linkObservations(
      toolCalls,
      /** @type {import('./agent-trajectory.js').ObservationResult[]} */ ([
        {
          sourceCallId: 'call_1',
          content: 'x',
          metadata: [],
          notice: '',
          marker: null,
          terminal: 'x',
          level: 'ok'
        }
      ])
    );
    expect(toolCalls[0].observations).toEqual([]);
  });
});

describe('splitObservation', () => {
  it('splits notice prefix and terminal content when marker is found', () => {
    const input =
      'Previous response had warnings:\nNon-standard environment path\nNew Terminal Output:\nroot@sandbox:/# ls\n';
    const result = splitObservation(input);
    expect(result.notice).toBe('Previous response had warnings:\nNon-standard environment path');
    expect(result.marker).toBe('New Terminal Output:');
    expect(result.terminal).toBe('root@sandbox:/# ls\n');
  });

  it('handles content with no marker as pure terminal output', () => {
    const input = 'root@sandbox:/# ls\nfile1 file2\n';
    const result = splitObservation(input);
    expect(result.notice).toBe('');
    expect(result.marker).toBeNull();
    expect(result.terminal).toBe(input);
  });

  it('handles parse error messages with no terminal marker as notice', () => {
    const input = 'Previous response had parsing errors: unexpected token at 1:1';
    const result = splitObservation(input);
    expect(result.notice).toBe(input);
    expect(result.marker).toBeNull();
    expect(result.terminal).toBe('');
  });
});

describe('noticeLevel', () => {
  it('returns ok for empty notice', () => {
    expect(noticeLevel('')).toBe('ok');
  });

  it('returns err for parse errors and ERROR strings', () => {
    expect(noticeLevel('Previous response had parsing errors')).toBe('err');
    expect(noticeLevel('Some notice\nERROR: Command failed')).toBe('err');
  });

  it('returns warn for warning notices', () => {
    expect(noticeLevel('Previous response had warnings')).toBe('warn');
    expect(noticeLevel('WARNING: Deprecated syntax')).toBe('warn');
  });

  it('returns ok for generic notices', () => {
    expect(noticeLevel('Informational note: session restarted')).toBe('ok');
  });
});

describe('detectStepLevel / isTaskCompleteStep', () => {
  it('always returns ok for user source', () => {
    const results = [
      {
        sourceCallId: null,
        content: '',
        notice: 'err',
        marker: null,
        terminal: '',
        level: /** @type {const} */ ('err'),
        metadata: []
      }
    ];
    expect(detectStepLevel('user', results)).toBe('ok');
  });

  it('returns err if any observation result has err level', () => {
    const results = [
      {
        sourceCallId: null,
        content: '',
        notice: 'err',
        marker: null,
        terminal: '',
        level: /** @type {const} */ ('err'),
        metadata: []
      },
      {
        sourceCallId: null,
        content: '',
        notice: 'warn',
        marker: null,
        terminal: '',
        level: /** @type {const} */ ('warn'),
        metadata: []
      }
    ];
    expect(detectStepLevel('agent', results)).toBe('err');
  });

  it('returns warn if observation result has warn level and no err', () => {
    const results = [
      {
        sourceCallId: null,
        content: '',
        notice: 'warn',
        marker: null,
        terminal: '',
        level: /** @type {const} */ ('warn'),
        metadata: []
      }
    ];
    expect(detectStepLevel('agent', results)).toBe('warn');
  });

  it('detects task complete tool call or property', () => {
    expect(
      isTaskCompleteStep(
        [
          {
            toolCallId: '1',
            functionName: 'mark_task_complete',
            codeArgs: [],
            metadata: [],
            observations: []
          }
        ],
        {}
      )
    ).toBe(true);
    expect(isTaskCompleteStep([], { task_complete: true })).toBe(true);
    expect(isTaskCompleteStep([], { is_task_complete: true })).toBe(true);
    expect(isTaskCompleteStep([], {})).toBe(false);
  });
});

describe('recoverJsonFields', () => {
  it('recovers key/value pairs from truncated JSON', () => {
    const text = '{"analysis": "The stray + 1 is the bug", "plan": "Rewrite calc.py",';
    expect(recoverJsonFields(text)).toEqual([
      { key: 'analysis', value: 'The stray + 1 is the bug' },
      { key: 'plan', value: 'Rewrite calc.py' }
    ]);
  });

  it('unescapes \\n and \\" inside recovered values', () => {
    const text = '{"plan": "line one\\nline two, says \\"go\\""';
    expect(recoverJsonFields(text)).toEqual([
      { key: 'plan', value: 'line one\nline two, says "go"' }
    ]);
  });

  it('returns an empty array when nothing is recoverable', () => {
    expect(recoverJsonFields('not json at all')).toEqual([]);
  });
});

describe('parseStructuredMessage', () => {
  it('extracts top-level string fields from well-formed JSON', () => {
    const result = parseStructuredMessage('{"analysis": "a", "plan": "b", "task_complete": false}');
    expect(result.malformed).toBe(false);
    expect(result.fields).toEqual([
      { key: 'analysis', value: 'a' },
      { key: 'plan', value: 'b' }
    ]);
  });

  it('strips an outer fenced code block before parsing', () => {
    const result = parseStructuredMessage('```json\n{"analysis": "a"}\n```');
    expect(result.malformed).toBe(false);
    expect(result.fields).toEqual([{ key: 'analysis', value: 'a' }]);
  });

  it('falls back to recovered fields and flags malformed on invalid JSON', () => {
    const result = parseStructuredMessage('{"analysis": "a", "plan": "b",');
    expect(result.malformed).toBe(true);
    expect(result.fields).toEqual([
      { key: 'analysis', value: 'a' },
      { key: 'plan', value: 'b' }
    ]);
  });

  it('returns no fields and malformed: false for plain prose', () => {
    const result = parseStructuredMessage('Just a regular message.');
    expect(result.malformed).toBe(false);
    expect(result.fields).toEqual([]);
  });
});

describe('normalizeTrajectory', () => {
  it('normalizes a minimal well-formed trajectory', () => {
    const result = normalizeTrajectory({
      schema_version: 'test-schema-v1',
      session_id: 'abc',
      agent: { name: 'test-agent', version: '2.0.0', model_name: 'test-model' },
      steps: [{ step_id: 1, timestamp: '2026-01-01T00:00:00Z', source: 'user', message: 'hi' }],
      final_metrics: { total_cost_usd: 1.5 }
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.schemaVersion).toBe('test-schema-v1');
    expect(result.sessionId).toBe('abc');
    expect(result.agent.name).toBe('test-agent');
    expect(result.steps).toHaveLength(1);
    expect(result.finalMetrics).toEqual([{ key: 'total_cost_usd', value: 1.5, display: '$1.5' }]);
  });

  it('normalizes a step with only a message and no optional fields, without throwing', () => {
    const result = normalizeTrajectory({
      steps: [{ step_id: 1, source: 'user', message: 'task' }]
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [step] = result.steps;
    expect(step.message).toBe('task');
    expect(step.toolCalls).toEqual([]);
    expect(step.stepObservations).toEqual([]);
    expect(step.metrics).toEqual([]);
    expect(step.timestamp).toBeNull();
    expect(step.modelName).toBeNull();
  });

  it('falls back to array index + 1 when step_id is missing', () => {
    const result = normalizeTrajectory({
      steps: [
        { source: 'user', message: 'a' },
        { source: 'agent', message: 'b' }
      ]
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps.map((s) => s.stepId)).toEqual([1, 2]);
  });

  it('accepts a bare array of steps with no wrapper object', () => {
    const result = normalizeTrajectory([{ step_id: 1, source: 'user', message: 'hi' }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps).toHaveLength(1);
    expect(result.schemaVersion).toBeNull();
    expect(result.metadata).toEqual([]);
  });

  it('accepts steps nested under a "trajectory" key', () => {
    const result = normalizeTrajectory({
      trajectory: { schema_version: 'v2', steps: [{ step_id: 1, source: 'user', message: 'hi' }] }
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.schemaVersion).toBe('v2');
    expect(result.steps).toHaveLength(1);
  });

  it('reports a structured failure when no steps array can be found', () => {
    const result = normalizeTrajectory({ not: 'a trajectory' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/steps array/i);
  });

  it('collects an unknown top-level key into metadata', () => {
    const result = normalizeTrajectory({ steps: [], run_metadata: { sandbox: 'x' } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.metadata).toEqual([{ path: 'run_metadata.sandbox', value: 'x', isJson: false }]);
  });

  it('collects an unknown agent key (including nested extra) into agent.metadata', () => {
    const result = normalizeTrajectory({
      steps: [],
      agent: { name: 'a', extra: { parser: 'xml' } }
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.agent.metadata).toEqual([{ path: 'extra.parser', value: 'xml', isJson: false }]);
  });

  it('collects an unknown step-level key into that step metadata', () => {
    const result = normalizeTrajectory({
      steps: [{ step_id: 1, source: 'agent', message: '', sandbox_id: 'demo-1' }]
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps[0].metadata).toEqual([
      { path: 'sandbox_id', value: 'demo-1', isJson: false }
    ]);
  });

  it('collects an unknown observation-level key into observationMetadata', () => {
    const result = normalizeTrajectory({
      steps: [
        {
          step_id: 1,
          source: 'agent',
          message: '',
          observation: { results: [], truncated: true }
        }
      ]
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps[0].observationMetadata).toEqual([
      { path: 'truncated', value: 'true', isJson: false }
    ]);
  });

  it('splits a multiline tool-call argument into codeArgs and a short one into metadata', () => {
    const result = normalizeTrajectory({
      steps: [
        {
          step_id: 1,
          source: 'agent',
          message: '',
          tool_calls: [
            {
              tool_call_id: 'call_1',
              function_name: 'bash_command',
              arguments: { keystrokes: 'ls -la\ncd project\n', duration: 0.1 }
            }
          ]
        }
      ]
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [toolCall] = result.steps[0].toolCalls;
    expect(toolCall.codeArgs).toEqual([{ label: 'keystrokes', code: 'ls -la\ncd project\n' }]);
    expect(toolCall.metadata).toEqual([
      { path: 'arguments.duration', value: '0.1', isJson: false }
    ]);
  });

  it('attaches a multi-tool-call step observation with no source_call_id at the step level', () => {
    const result = normalizeTrajectory({
      steps: [
        {
          step_id: 1,
          source: 'agent',
          message: '',
          tool_calls: [
            { tool_call_id: 'call_1', function_name: 'a', arguments: {} },
            { tool_call_id: 'call_2', function_name: 'b', arguments: {} }
          ],
          observation: { results: [{ content: 'merged terminal output' }] }
        }
      ]
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [step] = result.steps;
    expect(step.toolCalls[0].observations).toEqual([]);
    expect(step.toolCalls[1].observations).toEqual([]);
    expect(step.stepObservations).toHaveLength(1);
    expect(step.stepObservations[0].content).toBe('merged terminal output');
  });

  it('keeps the original raw step object for the Raw JSON view', () => {
    const rawStep = { step_id: 1, source: 'user', message: 'hi', unknown_field: 'x' };
    const result = normalizeTrajectory({ steps: [rawStep] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps[0].raw).toBe(rawStep);
  });

  it('normalizes the bundled EXAMPLE_TRAJECTORY cleanly', () => {
    const parsed = JSON.parse(EXAMPLE_TRAJECTORY);
    const result = normalizeTrajectory(parsed);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.steps[0].source).toBe('user');
    // deliberately exercises an unknown key at both the trajectory and step level
    expect(result.metadata.length).toBeGreaterThan(0);
    expect(result.steps.some((s) => s.metadata.length > 0)).toBe(true);
    // deliberately exercises the multi-tool-call / no-source_call_id linking path
    expect(result.steps.some((s) => s.stepObservations.length > 0 && s.toolCalls.length > 1)).toBe(
      true
    );
    // deliberately exercises metrics that omit cached_tokens
    expect(result.steps.some((s) => !s.metrics.some((m) => m.key === 'cached_tokens'))).toBe(true);
    // deliberately exercises a malformed structured message paired with an error notice
    const errorStep = result.steps.find((s) => s.level === 'err');
    expect(errorStep?.messageMalformed).toBe(true);
    expect(errorStep?.messageFields.length).toBeGreaterThan(0);
  });
});

describe('stepSummary', () => {
  it('returns the first non-empty line, collapsed to single spaces', () => {
    const step = { message: '\n\n  Line one   has   gaps  \nLine two', toolCalls: [] };
    expect(stepSummary(step)).toBe('Line one has gaps');
  });

  it('truncates a very long first line', () => {
    const step = { message: 'x'.repeat(200), toolCalls: [] };
    const summary = stepSummary(step);
    expect(summary.length).toBeLessThanOrEqual(140);
    expect(summary.endsWith('…')).toBe(true);
  });

  it('falls back to tool names when the message is empty', () => {
    const step = { message: '  ', toolCalls: [{ functionName: 'bash_command' }] };
    expect(stepSummary(step)).toBe('bash_command');
  });

  it('falls back to a placeholder when there is no message and no tool calls', () => {
    expect(stepSummary({ message: '', toolCalls: [] })).toBe('(no message)');
  });
});

describe('deltaMs / formatDelta', () => {
  it('computes the millisecond difference between two ISO timestamps', () => {
    expect(deltaMs('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:01.500Z')).toBe(1500);
  });

  it('returns null when either timestamp is missing or unparseable', () => {
    expect(deltaMs(null, '2026-01-01T00:00:00.000Z')).toBeNull();
    expect(deltaMs('2026-01-01T00:00:00.000Z', null)).toBeNull();
    expect(deltaMs('not a date', '2026-01-01T00:00:00.000Z')).toBeNull();
  });

  it('formats sub-second deltas in milliseconds and larger ones in seconds', () => {
    expect(formatDelta(400)).toBe('+400ms');
    expect(formatDelta(1300)).toBe('+1.3s');
  });

  it('formats an empty string for a null delta', () => {
    expect(formatDelta(null)).toBe('');
  });
});

describe('trajectoryStats', () => {
  it('counts steps by source and tool calls by function name', () => {
    const result = normalizeTrajectory({
      steps: [
        { step_id: 1, source: 'user', message: 'x' },
        {
          step_id: 2,
          source: 'agent',
          message: '',
          tool_calls: [{ tool_call_id: 'c1', function_name: 'bash_command', arguments: {} }]
        }
      ]
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stats = trajectoryStats(result);
    expect(stats.totalSteps).toBe(2);
    expect(stats.bySource).toEqual({ user: 1, agent: 1 });
    expect(stats.tools).toEqual(['bash_command']);
  });

  it('counts warnings and errors correctly in trajectoryStats', () => {
    const result = normalizeTrajectory({
      steps: [
        { step_id: 1, source: 'user', message: 'x' },
        {
          step_id: 2,
          source: 'agent',
          message: '',
          observation: {
            results: [
              { content: 'Previous response had warnings:\nDeprecation\nNew Terminal Output:\n1' }
            ]
          }
        },
        {
          step_id: 3,
          source: 'agent',
          message: '',
          observation: {
            results: [{ content: 'Previous response had parsing errors: bad json' }]
          }
        }
      ]
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stats = trajectoryStats(result);
    expect(stats.warningCount).toBe(1);
    expect(stats.errorCount).toBe(1);
    expect(stats.issueCount).toBe(2);
  });

  it('counts one warning and one error in the bundled EXAMPLE_TRAJECTORY', () => {
    const result = normalizeTrajectory(JSON.parse(EXAMPLE_TRAJECTORY));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stats = trajectoryStats(result);
    expect(stats.errorCount).toBe(1);
    expect(stats.warningCount).toBe(1);
    expect(stats.issueCount).toBe(2);
  });

  it('prefers final_metrics for totals when present', () => {
    const result = normalizeTrajectory({ steps: [], final_metrics: { total_cost_usd: 9 } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stats = trajectoryStats(result);
    expect(stats.totals).toEqual([{ key: 'total_cost_usd', value: 9, display: '$9' }]);
  });

  it('sums per-step metrics when there is no final_metrics', () => {
    const result = normalizeTrajectory({
      steps: [
        { step_id: 1, source: 'agent', message: '', metrics: { prompt_tokens: 10, cost_usd: 0.1 } },
        { step_id: 2, source: 'agent', message: '', metrics: { prompt_tokens: 5, cost_usd: 0.2 } }
      ]
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stats = trajectoryStats(result);
    const byKey = Object.fromEntries(stats.totals.map((t) => [t.key, t.value]));
    expect(byKey.prompt_tokens).toBe(15);
    expect(byKey.cost_usd).toBeCloseTo(0.3);
  });
});

describe('buildSearchIndex / filterSteps', () => {
  const trajectory = normalizeTrajectory({
    steps: [
      { step_id: 1, source: 'user', message: 'Fix the failing test' },
      {
        step_id: 2,
        source: 'agent',
        reasoning_content: 'Let us check pytest',
        message: 'Investigating',
        tool_calls: [
          {
            tool_call_id: 'c1',
            function_name: 'bash_command',
            arguments: { keystrokes: 'pytest -q\n' }
          }
        ],
        observation: {
          results: [
            { content: 'Previous response had warnings:\nslow run\nNew Terminal Output:\nok' }
          ]
        }
      },
      {
        step_id: 3,
        source: 'agent',
        message: 'All done, marking complete',
        observation: {
          results: [{ content: 'Previous response had parsing errors: parse failure' }]
        }
      },
      {
        step_id: 4,
        source: 'agent',
        message: '{"analysis": "the fixture needs a wobblesnort adapter",'
      }
    ]
  });

  it('finds a step by a word only present in reasoning_content', () => {
    expect(trajectory.ok).toBe(true);
    if (!trajectory.ok) return;
    const index = buildSearchIndex(trajectory.steps);
    const matches = filterSteps(trajectory.steps, index, { query: 'pytest' });
    expect(matches).toEqual([1]);
  });

  it('filters by source', () => {
    expect(trajectory.ok).toBe(true);
    if (!trajectory.ok) return;
    const index = buildSearchIndex(trajectory.steps);
    expect(filterSteps(trajectory.steps, index, { source: 'user' })).toEqual([0]);
  });

  it('filters by tool name', () => {
    expect(trajectory.ok).toBe(true);
    if (!trajectory.ok) return;
    const index = buildSearchIndex(trajectory.steps);
    expect(filterSteps(trajectory.steps, index, { tool: 'bash_command' })).toEqual([1]);
  });

  it('filters by issueFilter: warnings, errors, and issues', () => {
    expect(trajectory.ok).toBe(true);
    if (!trajectory.ok) return;
    const index = buildSearchIndex(trajectory.steps);
    expect(filterSteps(trajectory.steps, index, { issueFilter: 'warnings' })).toEqual([1]);
    expect(filterSteps(trajectory.steps, index, { issueFilter: 'errors' })).toEqual([2]);
    expect(filterSteps(trajectory.steps, index, { issueFilter: 'issues' })).toEqual([1, 2]);
  });

  it('combines query and source filters', () => {
    expect(trajectory.ok).toBe(true);
    if (!trajectory.ok) return;
    const index = buildSearchIndex(trajectory.steps);
    expect(filterSteps(trajectory.steps, index, { query: 'done', source: 'agent' })).toEqual([2]);
  });

  it('returns every index with no filters', () => {
    expect(trajectory.ok).toBe(true);
    if (!trajectory.ok) return;
    const index = buildSearchIndex(trajectory.steps);
    expect(filterSteps(trajectory.steps, index, {})).toEqual([0, 1, 2, 3]);
  });

  it('finds a step by a word only present in a field recovered from a malformed message', () => {
    expect(trajectory.ok).toBe(true);
    if (!trajectory.ok) return;
    const index = buildSearchIndex(trajectory.steps);
    expect(filterSteps(trajectory.steps, index, { query: 'wobblesnort' })).toEqual([3]);
  });
});

describe('EXAMPLE_TRAJECTORY', () => {
  it('is valid JSON', () => {
    expect(() => JSON.parse(EXAMPLE_TRAJECTORY)).not.toThrow();
  });
});
