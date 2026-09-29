import { describe, it, expect } from 'vitest';
import { messagesToTrajectory, messageText, convertToolResult } from './messages-trajectory.js';
import { normalizeTrajectory, trajectoryStats } from './agent-trajectory.js';

/**
 * A small, fictional chat-messages trajectory: system + task, an assistant turn with reasoning and
 * one call, an assistant turn with two calls, a failed (timed out) call, a truncated output, the
 * submit call and the closing exit message.
 */
function sampleMessages() {
  return {
    info: {
      model_stats: { instance_cost: 0.0123, api_calls: 4 },
      config: { model: { model_name: 'example/model' }, agent: { step_limit: 50 } },
      agent_version: '9.9.9',
      exit_status: 'Submitted',
      submission: ''
    },
    trajectory_format: 'example-messages-1',
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Fix the failing test in calc.py.' },
      {
        role: 'assistant',
        content: 'Let me look at the file.',
        reasoning_content: 'Start by reading calc.py.',
        tool_calls: [
          {
            id: 'call_a',
            type: 'function',
            function: { name: 'bash', arguments: '{"command": "ls"}' }
          }
        ],
        extra: {
          timestamp: 1767225600,
          cost: 0.001,
          response: {
            model: 'example-model',
            choices: [{ finish_reason: 'tool_calls' }],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 20,
              prompt_tokens_details: { cached_tokens: 80 },
              completion_tokens_details: { reasoning_tokens: 5 }
            }
          }
        }
      },
      {
        role: 'tool',
        tool_call_id: 'call_a',
        content: '{"returncode": 0, "output": "calc.py\\n"}',
        extra: { returncode: 0, timestamp: 1767225601 }
      },
      {
        role: 'assistant',
        content: null,
        thinking_blocks: [{ type: 'thinking', thinking: 'Read it and run the tests.' }],
        tool_calls: [
          { id: 'call_b', function: { name: 'bash', arguments: '{"command": "cat calc.py"}' } },
          { id: 'call_c', function: { name: 'bash', arguments: '{"command": "pytest -q"}' } }
        ],
        extra: { timestamp: 1767225610, response: { usage: { prompt_tokens: 200 } } }
      },
      {
        role: 'tool',
        tool_call_id: 'call_b',
        content: JSON.stringify({
          returncode: 0,
          output_head: 'def add(a, b):',
          output_tail: '    return a + b + 1',
          elided_chars: 1500,
          warning: 'Output was too long and has been truncated.'
        })
      },
      {
        role: 'tool',
        tool_call_id: 'call_c',
        content: '{"returncode": -1, "output": "", "exception_info": "Command timed out"}'
      },
      {
        role: 'assistant',
        content: 'Done.',
        tool_calls: [
          { id: 'call_d', function: { name: 'bash', arguments: '{"command": "submit"}' } }
        ]
      },
      {
        role: 'tool',
        tool_call_id: 'call_d',
        content: '{"returncode": -1, "output": "", "exception_info": "action was not executed"}'
      },
      { role: 'exit', content: '', extra: { exit_status: 'Submitted', submission: '' } }
    ]
  };
}

describe('messageText', () => {
  it('joins text content parts and keeps other parts as JSON', () => {
    const text = messageText([
      { type: 'text', text: 'hello' },
      { type: 'image', url: 'x' }
    ]);
    expect(text).toContain('hello');
    expect(text).toContain('"type": "image"');
  });

  it('returns an empty string for null content', () => {
    expect(messageText(null)).toBe('');
  });
});

describe('convertToolResult', () => {
  it('unwraps a JSON-encoded { returncode, output } payload', () => {
    const result = convertToolResult({
      role: 'tool',
      tool_call_id: 'x',
      content: '{"returncode": 2, "output": "boom"}'
    });
    expect(result).toMatchObject({ source_call_id: 'x', content: 'boom', returncode: 2 });
  });

  it('decodes double-encoded output into real newlines, keeping escapes that are part of it', () => {
    // The payload is itself a JSON string inside the trajectory JSON, so after the file is parsed
    // `content` still holds escaped `\n` sequences; the output also contains a literal `\n` (in a
    // printed regex) that must survive as-is.
    const payload = { returncode: 0, output: 'bin\nlib\nsplit(/\\r\\n?/)\n' };
    const content = JSON.stringify(payload, null, 2);
    expect(content).toContain('\\n');
    const result = convertToolResult({ role: 'tool', content });
    expect(result.content).toBe('bin\nlib\nsplit(/\\r\\n?/)\n');
    expect(result.returncode).toBe(0);
  });

  it('joins head and tail of truncated output around an elision marker', () => {
    const result = convertToolResult({
      role: 'tool',
      content: '{"output_head": "AAA", "output_tail": "ZZZ", "elided_chars": 1200}'
    });
    expect(result.content).toMatch(/^AAA[\s\S]*1,200 characters elided[\s\S]*ZZZ$/);
  });

  it('keeps non-JSON content verbatim', () => {
    const result = convertToolResult({ role: 'tool', content: 'plain output' });
    expect(result.content).toBe('plain output');
  });
});

describe('messagesToTrajectory', () => {
  it('returns null when there is no messages array', () => {
    expect(messagesToTrajectory({ foo: 1 })).toBeNull();
    expect(messagesToTrajectory([{ step_id: 1, source: 'user' }])).toBeNull();
  });

  it('accepts a bare array of role-tagged messages', () => {
    const converted = messagesToTrajectory([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' }
    ]);
    expect(converted?.trajectory.steps).toHaveLength(2);
  });

  it('folds tool results into the assistant step that made the call', () => {
    const converted = messagesToTrajectory(sampleMessages());
    const steps = /** @type {Record<string, any>[]} */ (converted?.trajectory.steps);
    expect(steps.map((s) => s.source)).toEqual([
      'system',
      'user',
      'agent',
      'agent',
      'agent',
      'exit'
    ]);
    expect(steps[3].observation.results.map((/** @type {any} */ r) => r.source_call_id)).toEqual([
      'call_b',
      'call_c'
    ]);
  });

  it('keeps the original messages as each step raw payload', () => {
    const converted = messagesToTrajectory(sampleMessages());
    expect(Array.isArray(converted?.rawSteps[2])).toBe(true);
    expect(converted?.rawSteps[0]).toEqual({
      role: 'system',
      content: 'You are a helpful assistant.'
    });
  });
});

describe('normalizeTrajectory with a messages trajectory', () => {
  const result = normalizeTrajectory(sampleMessages());
  if (!result.ok) throw new Error(result.reason);

  it('reads trajectory-level fields from info', () => {
    expect(result.schemaVersion).toBe('example-messages-1');
    expect(result.agent.version).toBe('9.9.9');
    expect(result.agent.modelName).toBe('example/model');
    expect(result.metadata.some((m) => m.path === 'exit_status')).toBe(true);
  });

  it('maps an assistant turn to an agent step with reasoning, tool calls and metrics', () => {
    const step = result.steps[2];
    expect(step.stepId).toBe(3);
    expect(step.timestamp).toBe('2026-01-01T00:00:00.000Z');
    expect(step.modelName).toBe('example-model');
    expect(step.reasoningContent).toBe('Start by reading calc.py.');
    expect(step.toolCalls[0]).toMatchObject({
      toolCallId: 'call_a',
      functionName: 'bash',
      codeArgs: [{ label: 'command', code: 'ls' }]
    });
    expect(step.stepObservations[0].terminal).toBe('calc.py\n');
    expect(step.metrics.map((m) => m.key)).toEqual([
      'prompt_tokens',
      'completion_tokens',
      'cached_tokens',
      'reasoning_tokens',
      'cost_usd'
    ]);
    expect(step.raw).toEqual(sampleMessages().messages.slice(2, 4));
  });

  it('falls back to thinking blocks for reasoning', () => {
    expect(result.steps[3].reasoningContent).toBe('Read it and run the tests.');
  });

  it('flags a warning notice as warn and an exception as err', () => {
    const [truncated, timedOut] = result.steps[3].stepObservations;
    expect(truncated.level).toBe('warn');
    expect(truncated.notice).toMatch(/truncated/);
    expect(timedOut.level).toBe('err');
    expect(timedOut.notice).toBe('Command timed out');
    expect(result.steps[3].level).toBe('err');
  });

  it('marks the submitting step complete without flagging its intercepted call', () => {
    const submit = result.steps[4];
    expect(submit.isTaskComplete).toBe(true);
    expect(submit.level).toBe('ok');
    expect(submit.stepObservations[0].metadata.some((m) => m.path === 'submission_note')).toBe(
      true
    );
    expect(result.steps[5]).toMatchObject({ source: 'exit', isTaskComplete: true });
  });

  it('totals tokens alongside the reported model stats', () => {
    const stats = trajectoryStats(result);
    const totals = Object.fromEntries(stats.totals.map((m) => [m.key, m.value]));
    expect(totals).toMatchObject({
      total_prompt_tokens: 300,
      total_completion_tokens: 20,
      total_cached_tokens: 80,
      instance_cost: 0.0123,
      api_calls: 4
    });
    expect(stats.errorCount).toBe(1);
  });
});
