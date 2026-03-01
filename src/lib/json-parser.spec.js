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

  it('parses valid JSON primitives', () => {
    expect(parseJson('"hello"').success).toBe(true);
    expect(parseJson('42').success).toBe(true);
    expect(parseJson('true').success).toBe(true);
    expect(parseJson('false').success).toBe(true);
    expect(parseJson('null').success).toBe(true);
  });

  it('parses nested objects', () => {
    const input = '{"a": {"b": {"c": 1}}}';
    const result = parseJson(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.a.b.c).toBe(1);
    }
  });

  it('returns error for empty string', () => {
    const result = parseJson('');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBeTruthy();
    }
  });

  it('returns error for invalid JSON', () => {
    const result = parseJson('{invalid}');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBeTruthy();
    }
  });

  it('returns error for trailing comma', () => {
    const result = parseJson('{"a": 1,}');
    expect(result.success).toBe(false);
  });

  it('returns error for single quotes', () => {
    const result = parseJson("{'a': 1}");
    expect(result.success).toBe(false);
  });

  it('returns error for unquoted keys', () => {
    const result = parseJson('{a: 1}');
    expect(result.success).toBe(false);
  });

  it('extracts line/column from position-based errors', () => {
    const input = '{\n  "a": 1,\n  "b": bad\n}';
    const result = parseJson(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBeTruthy();
    }
  });

  it('reports correct line for trailing comma error', () => {
    const input = DEFAULT_CONTENT.replace(
      '"json-parser": { "status": "available" }',
      '"json-parser": { "status": "available", }'
    );
    const result = parseJson(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.line).toBe(12);
    }
  });

  it('handles whitespace-only input as invalid', () => {
    const result = parseJson('   ');
    expect(result.success).toBe(false);
  });

  it('handles deeply nested valid JSON', () => {
    const input = JSON.stringify({ a: { b: { c: { d: { e: 'deep' } } } } });
    const result = parseJson(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.a.b.c.d.e).toBe('deep');
    }
  });

  it('preserves unicode in formatted output', () => {
    const result = parseJson('{"emoji": "\\u2764"}');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.emoji).toBe('\u2764');
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
