import { describe, it, expect } from 'vitest';
import { parseJson, countJsonStats, DEFAULT_CONTENT } from './json-parser.js';

describe('parseJson', () => {
  it('parses valid JSON object', () => {
    const result = parseJson('{"a": 1}');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ a: 1 });
      expect(result.formatted).toBe('{\n  "a": 1\n}');
      expect(result.minified).toBe('{"a":1}');
    }
  });

  it('parses valid JSON array', () => {
    const result = parseJson('[1, 2, 3]');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual([1, 2, 3]);
      expect(result.minified).toBe('[1,2,3]');
    }
  });

  it('returns error for empty string', () => {
    const result = parseJson('');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[0].message).toBeTruthy();
    }
  });

  it('handles whitespace-only input as invalid', () => {
    const result = parseJson('   ');
    expect(result.success).toBe(false);
  });

  it('reports correct line for trailing comma error', () => {
    const input = DEFAULT_CONTENT.replace(
      '"json-parser": { "status": "available" }',
      '"json-parser": { "status": "available", }'
    );
    const result = parseJson(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[0].line).toBe(13);
    }
  });

  it('reports trailing comma with friendly message', () => {
    const result = parseJson('{"a": 1,}');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[0].message).toMatch(/[Tt]railing comma/);
    }
  });

  it('reports single-quote strings with friendly message', () => {
    const result = parseJson("{'a': 1}");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[0].message).toMatch(/double quotes/);
    }
  });

  it('reports JS comments with friendly message', () => {
    const result = parseJson('{ // comment\n"a": 1 }');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[0].message).toMatch(/does not support comments/);
    }
  });

  it('reports multiple errors at once', () => {
    // Two trailing commas — one in each nested object
    const input = '{"a": 1,, "b": 2}';
    const result = parseJson(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(1);
    }
  });
});

describe('countJsonStats', () => {
  it('returns zeros for empty string', () => {
    expect(countJsonStats('')).toEqual({ lines: 0, chars: 0 });
  });

  it('counts single line', () => {
    expect(countJsonStats('{"a": 1}')).toEqual({ lines: 1, chars: 8 });
  });

  it('counts multiple lines', () => {
    const input = '{\n  "a": 1\n}';
    expect(countJsonStats(input)).toEqual({ lines: 3, chars: 12 });
  });

  it('counts characters including whitespace', () => {
    expect(countJsonStats('  hello  ')).toEqual({ lines: 1, chars: 9 });
  });
});
