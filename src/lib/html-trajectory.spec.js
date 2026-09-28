import { describe, expect, it } from 'vitest';
import {
  extractTrajectoryData,
  htmlTrajectoryToTrajectory,
  parseCallArguments,
  EXAMPLE_TRAJECTORY_HTML
} from './html-trajectory.js';
import { normalizeTrajectory } from './agent-trajectory.js';

/**
 * Wraps a DATA object in a minimal exported page, the way the real exports embed it.
 * @param {unknown} data
 * @returns {string}
 */
function page(data) {
  return `<html><body><script>\nconst DATA = ${JSON.stringify(data).replace(/<\//g, '<\\/')};\n\nconst KIND = {};\n</script></body></html>`;
}

describe('extractTrajectoryData', () => {
  it('parses the embedded object and ignores the script that follows it', () => {
    const data = extractTrajectoryData(page({ steps: [], note: 'x' }));
    expect(data).toEqual({ steps: [], note: 'x' });
  });

  it('skips braces and escaped quotes inside strings', () => {
    const data = extractTrajectoryData(page({ steps: [], text: 'a } b { "quoted }" c' }));
    expect(/** @type {any} */ (data).text).toBe('a } b { "quoted }" c');
  });

  it('decodes <\\/ escapes used to keep </script> out of the data', () => {
    const data = extractTrajectoryData(page({ steps: [], text: '</issue></script>' }));
    expect(/** @type {any} */ (data).text).toBe('</issue></script>');
  });

  it('rejects empty input', () => {
    expect(() => extractTrajectoryData('   ')).toThrow('Paste some HTML first.');
  });

  it('rejects a page without an embedded DATA object', () => {
    expect(() => extractTrajectoryData('<p>hello</p>')).toThrow(/No embedded trajectory found/);
  });

  it('rejects a DATA value that is not an object literal', () => {
    expect(() => extractTrajectoryData('<script>const DATA = [1, 2];</script>')).toThrow(
      /not an object literal/
    );
  });

  it('rejects a truncated DATA object', () => {
    expect(() => extractTrajectoryData('<script>const DATA = {"steps": [')).toThrow(/incomplete/);
  });

  it('reports invalid JSON with the parser message', () => {
    expect(() => extractTrajectoryData('<script>const DATA = {steps: []};</script>')).toThrow(
      /not valid JSON: /
    );
  });

  it('rejects a DATA object without a steps array', () => {
    expect(() => extractTrajectoryData(page({ task: 'x' }))).toThrow(/no "steps" array/);
  });
});

describe('parseCallArguments', () => {
  it('unwraps an inline backticked value', () => {
    expect({ ...parseCallArguments('• **instruction**: `ls -la`') }).toEqual({
      instruction: 'ls -la'
    });
  });

  it('strips the fence from a value on the following lines', () => {
    const args = parseCallArguments('• **instruction**:\n```\necho {a}\necho b\n```');
    expect({ ...args }).toEqual({ instruction: 'echo {a}\necho b' });
  });

  it('splits several bullets into separate arguments', () => {
    const args = parseCallArguments(
      '• **path**: `src/a.js`\n• **content**:\n```js\nconst a = 1;\n```\n• **mode**: overwrite'
    );
    expect({ ...args }).toEqual({ path: 'src/a.js', content: 'const a = 1;', mode: 'overwrite' });
  });

  it('keeps non-bullet text whole under a text argument', () => {
    expect({ ...parseCallArguments('path_to_file:"foo.py"') }).toEqual({
      text: 'path_to_file:"foo.py"'
    });
  });

  it('returns no arguments for empty text', () => {
    expect(Object.keys(parseCallArguments(''))).toHaveLength(0);
  });

  it('stores a __proto__ key as a plain own key', () => {
    const args = parseCallArguments('• **__proto__**: `polluted`');
    expect(Object.getOwnPropertyNames(args)).toEqual(['__proto__']);
    expect(/** @type {any} */ ({}).polluted).toBeUndefined();
  });
});

describe('htmlTrajectoryToTrajectory', () => {
  const data = {
    case_id: 'case-a',
    kind: 'trajectory',
    task: 'Fix the bug.',
    preamble: '',
    system_constraint: '• Be careful.',
    critic_allegation: 'Step 2 is wrong.',
    critic_step_cited: 'Step 2',
    cited_ordinals: [2],
    steps: [
      {
        ordinal: 1,
        index: 1,
        number: 1,
        label: 'Step 1',
        cited: false,
        turn: 1,
        prompts: [],
        blocks: [
          { kind: 'thought', name: '', text: 'Looking around.' },
          { kind: 'call', name: 'shell', text: '• **instruction**: `ls`' },
          { kind: 'call', name: 'shell', text: '• **instruction**: `pwd`' },
          { kind: 'response', name: 'shell', text: '```\na.txt\n```' },
          { kind: 'response', name: 'shell', text: '```\n/app\n```' },
          { kind: 'response', name: 'shell', text: 'orphan output' }
        ]
      },
      {
        ordinal: 2,
        label: 'Step 2',
        cited: true,
        turn: 2,
        prompts: [{ turn: 2, kind: 'handoff', text: 'Context full.' }],
        blocks: [
          { kind: 'thought', name: '', text: 'Wrapping up.' },
          { kind: 'message', name: '', text: 'Done.' },
          { kind: 'user', name: '', text: 'Thanks!' }
        ]
      }
    ]
  };
  const result = /** @type {any} */ (htmlTrajectoryToTrajectory(page(data)));

  it('uses the case id as the session id and tags the schema', () => {
    expect(result.schema_version).toBe('html-trajectory-v1');
    expect(result.session_id).toBe('case-a');
    expect(result.agent).toEqual({ name: 'html-trajectory' });
  });

  it('falls back to the provided session id when there is no case id', () => {
    const converted = htmlTrajectoryToTrajectory(page({ steps: [], task: 't' }), {
      sessionId: 'fixed'
    });
    expect(converted.session_id).toBe('fixed');
  });

  it('passes page-level extras through for the metadata view', () => {
    expect(result.critic_allegation).toBe('Step 2 is wrong.');
    expect(result.critic_step_cited).toBe('Step 2');
    expect(result.cited_ordinals).toEqual([2]);
    expect(result.case_id).toBe('case-a');
    expect(result).not.toHaveProperty('task');
    expect(result).not.toHaveProperty('preamble');
  });

  it('turns the task and constraints into a leading user step 0', () => {
    const [first] = result.steps;
    expect(first.step_id).toBe(0);
    expect(first.source).toBe('user');
    expect(first.message).toBe('## System constraints\n\n• Be careful.\n\n## Task\n\nFix the bug.');
  });

  it('omits step 0 when the page has no task fields', () => {
    const converted = htmlTrajectoryToTrajectory(page({ steps: [{ ordinal: 1, blocks: [] }] }));
    expect(converted.steps.map((s) => s.step_id)).toEqual([1]);
  });

  it('joins thought and message blocks into the step message', () => {
    expect(result.steps[1].message).toBe('Looking around.');
    expect(result.steps[2].message).toBe('Wrapping up.\n\nDone.');
  });

  it('maps call blocks to tool calls with parsed arguments', () => {
    expect(result.steps[1].tool_calls).toEqual([
      { tool_call_id: 'call_1_1', function_name: 'shell', arguments: { instruction: 'ls' } },
      { tool_call_id: 'call_1_2', function_name: 'shell', arguments: { instruction: 'pwd' } }
    ]);
  });

  it('pairs responses with calls in order and leaves leftovers unlinked', () => {
    expect(result.steps[1].observation.results).toEqual([
      { content: 'a.txt', source_call_id: 'call_1_1' },
      { content: '/app', source_call_id: 'call_1_2' },
      { content: 'orphan output' }
    ]);
  });

  it('strips ANSI colour codes from responses', () => {
    const converted = /** @type {any} */ (
      htmlTrajectoryToTrajectory(
        page({
          steps: [{ ordinal: 1, blocks: [{ kind: 'response', text: '\u001b[32mok\u001b[0m' }] }]
        })
      )
    );
    expect(converted.steps[0].observation.results[0].content).toBe('ok');
  });

  it('keeps step extras, non-empty prompts and unhandled blocks as step fields', () => {
    const [, one, two] = result.steps;
    expect(one).toMatchObject({ label: 'Step 1', cited: false, turn: 1 });
    expect(one).not.toHaveProperty('prompts');
    expect(one).not.toHaveProperty('index');
    expect(two).toMatchObject({ cited: true, turn: 2 });
    expect(two.prompts).toEqual([{ turn: 2, kind: 'handoff', text: 'Context full.' }]);
    expect(two.extra_blocks).toEqual([{ kind: 'user', name: '', text: 'Thanks!' }]);
  });

  it('normalizes cleanly, surfacing the extras as metadata', () => {
    const normalized = normalizeTrajectory(result);
    if (!normalized.ok) throw new Error(normalized.reason);
    expect(normalized.metadata.map((m) => m.path)).toContain('critic_allegation');
    expect(normalized.steps[2].metadata.map((m) => m.path)).toEqual(
      expect.arrayContaining(['label', 'cited', 'turn', 'prompts', 'extra_blocks'])
    );
    expect(normalized.steps[1].toolCalls[0].metadata).toContainEqual({
      path: 'arguments.instruction',
      value: 'ls',
      isJson: false
    });
  });
});

describe('EXAMPLE_TRAJECTORY_HTML', () => {
  it('converts and normalizes into the task step plus every example step', () => {
    const converted = htmlTrajectoryToTrajectory(EXAMPLE_TRAJECTORY_HTML);
    const normalized = normalizeTrajectory(converted);
    expect(normalized.ok).toBe(true);
    expect(converted.steps).toHaveLength(5);
    expect(converted.session_id).toBe('example-case-001');
  });
});
