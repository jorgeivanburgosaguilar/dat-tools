import { describe, it, expect } from 'vitest';
import {
  LANGUAGES,
  ensureHighlighter,
  isKnownLanguage,
  highlightLines,
  detectLanguage
} from './syntax-highlight.js';

describe('LANGUAGES', () => {
  it('starts with plain text', () => {
    expect(LANGUAGES[0].id).toBe('plain');
  });

  it('has unique ids', () => {
    const ids = LANGUAGES.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique labels', () => {
    const labels = LANGUAGES.map((l) => l.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('ensureHighlighter', () => {
  it('registers every non-plain LANGUAGES id in lowlight', async () => {
    const lowlight = await ensureHighlighter();
    expect(lowlight).not.toBeNull();
    for (const { id } of LANGUAGES) {
      if (id === 'plain') continue;
      expect(lowlight?.registered(id)).toBe(true);
    }
  });

  it('resolves concurrent calls to the same instance', async () => {
    const [a, b] = await Promise.all([ensureHighlighter(), ensureHighlighter()]);
    expect(a).toBe(b);
  });
});

describe('isKnownLanguage', () => {
  it('is true for a registered id and false for junk', () => {
    expect(isKnownLanguage('javascript')).toBe(true);
    expect(isKnownLanguage('not-a-real-language')).toBe(false);
  });
});

describe('highlightLines', () => {
  it('returns one null-class run per non-empty line for plain text', async () => {
    const lowlight = await ensureHighlighter();
    const lines = ['const a = 1;', 'const b = 2;'];
    const runs = highlightLines(lines, 'plain', lowlight);
    expect(runs).toHaveLength(2);
    for (const [i, lineRuns] of runs.entries()) {
      expect(lineRuns).toEqual([{ text: lines[i], className: null }]);
    }
  });

  it('produces an hljs- class for javascript and reconstructs each line exactly', async () => {
    const lowlight = await ensureHighlighter();
    const lines = ['const a = 1;', 'const b = 2;'];
    const runs = highlightLines(lines, 'javascript', lowlight);
    const hasHljsClass = runs.flat().some((r) => r.className?.startsWith('hljs-'));
    expect(hasHljsClass).toBe(true);
    runs.forEach((lineRuns, i) => {
      expect(lineRuns.map((r) => r.text).join('')).toBe(lines[i]);
    });
  });

  it('keeps a block comment classified across every line it spans', async () => {
    const lowlight = await ensureHighlighter();
    const lines = ['/* start', 'middle', 'end */', 'const a = 1;'];
    const runs = highlightLines(lines, 'javascript', lowlight);
    // every one of the first three lines should carry a comment-related class
    for (let i = 0; i < 3; i++) {
      expect(runs[i].some((r) => r.className?.includes('comment'))).toBe(true);
    }
  });

  it('keeps a multi-line template literal classified across its lines', async () => {
    const lowlight = await ensureHighlighter();
    const lines = ['const s = `line one', 'line two`;'];
    const runs = highlightLines(lines, 'javascript', lowlight);
    expect(runs.flat().some((r) => r.className != null)).toBe(true);
    runs.forEach((lineRuns, i) => {
      expect(lineRuns.map((r) => r.text).join('')).toBe(lines[i]);
    });
  });

  it('falls back to plain for an unknown language id without throwing', async () => {
    const lowlight = await ensureHighlighter();
    const lines = ['some text'];
    expect(() => highlightLines(lines, 'not-a-real-language', lowlight)).not.toThrow();
    const runs = highlightLines(lines, 'not-a-real-language', lowlight);
    expect(runs).toEqual([[{ text: 'some text', className: null }]]);
  });

  it('falls back to plain when the highlighter is null', () => {
    const runs = highlightLines(['x'], 'javascript', null);
    expect(runs).toEqual([[{ text: 'x', className: null }]]);
  });

  it('preserves line count including a trailing empty line', async () => {
    const lowlight = await ensureHighlighter();
    const lines = ['const a = 1;', ''];
    const runs = highlightLines(lines, 'javascript', lowlight);
    expect(runs).toHaveLength(2);
    expect(runs[1]).toEqual([]);
  });

  it('returns an empty array for no lines', async () => {
    const lowlight = await ensureHighlighter();
    expect(highlightLines([], 'javascript', lowlight)).toEqual([]);
  });

  it('returns script-tag text literally with no HTML entities', async () => {
    const lowlight = await ensureHighlighter();
    const lines = ['<script>alert(1)</script>'];
    const runs = highlightLines(lines, 'xml', lowlight);
    const joined = runs
      .flat()
      .map((r) => r.text)
      .join('');
    expect(joined).toBe('<script>alert(1)</script>');
    expect(joined).not.toContain('&lt;');
  });
});

describe('detectLanguage', () => {
  const JS_SAMPLE = `function greet(name) {
  console.log('Hello, ' + name + '!');
  return true;
}

const users = ['ada', 'grace', 'margaret'];
for (const user of users) {
  greet(user);
}`;

  const PYTHON_SAMPLE = `def greet(name):
    print(f"Hello, {name}!")
    return True

users = ['ada', 'grace', 'margaret']
for user in users:
    greet(user)`;

  const PROSE_SAMPLE =
    'This is just a plain paragraph of English text with no code in it at all, ' +
    'written to see whether the detector mistakes prose for a programming language.';

  it('confidently detects a clear JavaScript sample', async () => {
    const lowlight = await ensureHighlighter();
    expect(detectLanguage(JS_SAMPLE, lowlight)).toBe('javascript');
  });

  it('confidently detects a clear Python sample', async () => {
    const lowlight = await ensureHighlighter();
    expect(detectLanguage(PYTHON_SAMPLE, lowlight)).toBe('python');
  });

  it('returns null for short/ambiguous text below the length gate', async () => {
    const lowlight = await ensureHighlighter();
    expect(detectLanguage('const a = 1;', lowlight)).toBeNull();
  });

  it('returns null for plain English prose', async () => {
    const lowlight = await ensureHighlighter();
    expect(detectLanguage(PROSE_SAMPLE, lowlight)).toBeNull();
  });

  it('returns null when the highlighter is null', () => {
    expect(detectLanguage(JS_SAMPLE, null)).toBeNull();
  });

  it('returns null for empty or whitespace-only text', async () => {
    const lowlight = await ensureHighlighter();
    expect(detectLanguage('', lowlight)).toBeNull();
    expect(detectLanguage('   \n\t  ', lowlight)).toBeNull();
  });

  it('never guesses the excluded php-template grammar for plain HTML', async () => {
    const lowlight = await ensureHighlighter();
    const html =
      '<!DOCTYPE html>\n<html>\n<head><title>Test</title></head>\n<body></body>\n</html>';
    expect(detectLanguage(html, lowlight)).not.toBe('php-template');
  });
});
