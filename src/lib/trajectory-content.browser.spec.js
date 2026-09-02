import { describe, it, expect } from 'vitest';
import DOMPurify from 'dompurify';
import { renderMarkdown } from './markdown-preview.js';
import {
  classifyContent,
  renderRichText,
  stripAnsi,
  guessCodeLanguage
} from './trajectory-content.js';
import { ensureHighlighter } from './syntax-highlight.js';

describe('trajectory-content', () => {
  it('runs with a real DOMPurify instance in the browser project', () => {
    // Guards the whole suite the same way markdown-preview.browser.spec.js does: under Node,
    // DOMPurify.isSupported is false and renderRichText() skips sanitization entirely, so every
    // assertion below would still pass against unsanitized HTML without this file ever catching a
    // real regression. This must run in the client project.
    expect(DOMPurify.isSupported).toBe(true);
  });

  describe('classifyContent', () => {
    it('classifies plain terminal-ish prose as text', () => {
      expect(classifyContent('root@sandbox:/app# ls -la\ntotal 12\ndrwxr-xr-x  3 root root')).toBe(
        'text'
      );
    });

    it('classifies a heading and list as markdown', () => {
      expect(classifyContent('## Plan\n\n- step one\n- step two')).toBe('markdown');
    });

    it('classifies a fenced code block as markdown', () => {
      expect(classifyContent('Notice:\n```python\nx = 1\n```')).toBe('markdown');
    });

    it('classifies several bare HTML tags with no markdown syntax as html', () => {
      expect(classifyContent('<table><tr><td>a</td></tr></table>')).toBe('html');
    });

    it('classifies markdown with embedded raw HTML as markdown, not html', () => {
      expect(
        classifyContent('Shortcut: <kbd>Ctrl</kbd> + <kbd>S</kbd>\n\n- also a list item')
      ).toBe('markdown');
    });

    it('classifies empty or whitespace-only text as text', () => {
      expect(classifyContent('')).toBe('text');
      expect(classifyContent('   \n  ')).toBe('text');
    });
  });

  describe('renderRichText sanitization', () => {
    it('strips a script tag embedded in markdown input', () => {
      // A bare `<script>` tag with nothing else has no markdown syntax and isn't in the small
      // "known" HTML tag allowlist classifyContent() checks, so on its own it classifies as
      // plain text - already safe (HTML-escaped), but this exercises the markdown branch's raw
      // HTML passthrough (the same one MarkdownPreview's DEFAULT_CONTENT relies on for <details>).
      const html = renderRichText('# Heading\n\nbefore <script>alert(1)</script> after');
      expect(html).not.toContain('<script');
      expect(html).not.toContain('alert(1)');
    });

    it('HTML-escapes a lone script tag classified as plain text', () => {
      const html = renderRichText('before <script>alert(1)</script> after');
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('strips an onerror handler from an injected image in markdown input', () => {
      const html = renderRichText('<img src="x" onerror="alert(1)">\n\n- list item');
      expect(html).not.toContain('onerror');
    });

    it('strips a script tag from raw HTML-classified input', () => {
      const html = renderRichText('<table><tr><td>a</td></tr></table><script>alert(1)</script>');
      expect(html).not.toContain('<script');
      expect(html).not.toContain('alert(1)');
    });

    it('neutralizes a javascript: link in markdown input', () => {
      const html = renderRichText('[click me](javascript:alert(1))');
      expect(html).not.toContain('javascript:');
    });

    it('renders plain text as an escaped paragraph, not markdown', () => {
      const html = renderRichText(
        'This sentence has a * lone asterisk * in the middle, nothing more.'
      );
      expect(html).toContain('<p>');
      expect(html).toContain('*');
      expect(html).not.toContain('<ul>');
    });
  });

  describe('renderRichText fenced code highlighting', () => {
    it('produces hljs- spans for a fenced code block once a highlighter is loaded', async () => {
      const lowlight = await ensureHighlighter();
      const html = renderRichText('```javascript\nconst a = 1;\n```', lowlight);
      expect(html).toContain('class="hljs-');
    });

    it('falls back to escaped plain code with no highlighter', () => {
      const html = renderRichText('```javascript\nconst a = "<x>";\n```', null);
      expect(html).toContain('<pre>');
      expect(html).not.toContain('<x>');
    });
  });

  describe('stripAnsi', () => {
    it('removes ANSI color escape sequences', () => {
      expect(stripAnsi('[31mred text[0m')).toBe('red text');
    });

    it('leaves plain text untouched', () => {
      expect(stripAnsi('plain output')).toBe('plain output');
    });
  });

  describe('guessCodeLanguage', () => {
    it('falls back when there is no loaded highlighter', () => {
      expect(guessCodeLanguage('ls -la', 'bash', null)).toBe('bash');
    });

    it('detects a confident language from a real highlighter', async () => {
      const lowlight = await ensureHighlighter();
      const js = `function greet(name) {\n  console.log('Hello, ' + name + '!');\n  return true;\n}`;
      expect(guessCodeLanguage(js, 'plain', lowlight)).toBe('javascript');
    });
  });

  describe('module isolation from markdown-preview.js', () => {
    it('does not clobber the shared marked singleton renderMarkdown() depends on', () => {
      // trajectory-content.js must build its own `new Marked()` instance per render rather than
      // calling marked.use() on the shared singleton - otherwise loading this module would break
      // markdown-preview.js's data-line scroll-sync renderer. Render through both to prove it.
      renderRichText('# Heading\n\nSome text');
      const html = renderMarkdown('# Heading');
      expect(html).toContain('data-line="1"');
    });
  });
});
