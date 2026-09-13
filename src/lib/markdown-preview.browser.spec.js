import { describe, it, expect } from 'vitest';
import DOMPurify from 'dompurify';
import { renderMarkdown, DEFAULT_CONTENT } from './markdown-preview.js';

describe('renderMarkdown', () => {
  it('runs with a real DOMPurify instance in the browser project', () => {
    // Guards the whole suite: under Node, DOMPurify.isSupported is false and
    // renderMarkdown() skips sanitization entirely, so every assertion below
    // would still pass against unsanitized HTML without this file ever
    // catching a real XSS regression. This must run in the client project.
    expect(DOMPurify.isSupported).toBe(true);
  });

  describe('standard markdown rendering', () => {
    it('renders headings h1 through h6', () => {
      const html = renderMarkdown('# H1\n\n###### H6');
      expect(html).toContain('<h1');
      expect(html).toContain('</h1>');
      expect(html).toContain('<h6');
      expect(html).toContain('</h6>');
    });

    it('renders paragraphs', () => {
      const html = renderMarkdown('Hello world');
      expect(html).toContain('<p');
      expect(html).toContain('Hello world');
    });

    it('renders inline bold, italic, strikethrough, and code', () => {
      const html = renderMarkdown('**bold** *italic* ~~strike~~ `code`');
      expect(html).toContain('<strong>bold</strong>');
      expect(html).toContain('<em>italic</em>');
      expect(html).toContain('<del>strike</del>');
      expect(html).toContain('<code>code</code>');
    });

    it('renders blockquotes', () => {
      const html = renderMarkdown('> quoted text');
      expect(html).toContain('<blockquote');
      expect(html).toContain('quoted text');
    });

    it('renders unordered and ordered lists', () => {
      const html = renderMarkdown('- one\n- two\n\n1. first\n2. second');
      expect(html).toContain('<ul>');
      expect(html).toContain('<li>one</li>');
      expect(html).toContain('<ol>');
      expect(html).toContain('<li>first</li>');
    });

    it('renders a task list with checked and unchecked items', () => {
      const html = renderMarkdown('- [x] done\n- [ ] todo');
      expect(html).toContain('checked');
      expect(html).toContain('type="checkbox"');
    });

    it('renders fenced code blocks with a language class', () => {
      const html = renderMarkdown('```javascript\nconst x = 1;\n```');
      expect(html).toContain('<pre');
      expect(html).toContain('class="language-javascript"');
      expect(html).toContain('const x = 1;');
    });

    it('renders a table with column alignment', () => {
      const html = renderMarkdown('| A | B |\n| :- | -: |\n| 1 | 2 |');
      expect(html).toContain('<table');
      expect(html).toContain('align="left"');
      expect(html).toContain('align="right"');
      expect(html).toContain('<th');
      expect(html).toContain('<td');
    });

    it('renders a horizontal rule', () => {
      const html = renderMarkdown('above\n\n---\n\nbelow');
      expect(html).toContain('<hr');
    });
  });

  describe('HTML and XML inside code fences', () => {
    // Regression suite for a bug where the custom `code` renderer (added for the data-line
    // scroll-sync attribute) interpolated the fence body and language string raw, so HTML/XML
    // written inside a ```html or ```xml fence was parsed as real markup instead of shown as
    // literal text. Assertions parse the returned HTML into a real DOM rather than matching
    // strings, so they stay stable across marked's exact escaping choices (e.g. `&quot;` vs `"`
    // in text nodes) while still failing hard if any real element leaks out of the <code> block.

    /** @param {string} html */
    function parse(html) {
      return new DOMParser().parseFromString(html, 'text/html').body;
    }

    it('shows a script tag as visible text instead of executing it', () => {
      const html = renderMarkdown('```html\n<script>alert(1)</script>\n```');
      const body = parse(html);
      expect(body.querySelector('script')).toBeNull();
      const code = body.querySelector('code');
      expect(code?.textContent).toContain('<script>alert(1)</script>');
    });

    it('shows an HTML element as text instead of rendering it as an element', () => {
      const html = renderMarkdown('```html\n<div class="x">hi</div>\n```');
      const body = parse(html);
      const code = body.querySelector('code');
      expect(code?.querySelector('*')).toBeNull();
      expect(code?.textContent?.trim()).toBe('<div class="x">hi</div>');
    });

    it('preserves an XML fence as literal text', () => {
      const html = renderMarkdown('```xml\n<note><to>Tove</to></note>\n```');
      const body = parse(html);
      const code = body.querySelector('code');
      expect(code?.querySelector('*')).toBeNull();
      expect(code?.textContent?.trim()).toBe('<note><to>Tove</to></note>');
    });

    it('preserves a style fence as text rather than stripping it', () => {
      // DOMPurify's literal-text mXSS guard removes a real <style> element whose content
      // reopens markup on reparse — this only stays safe if the fence never became a real
      // <style> element in the first place.
      const html = renderMarkdown('```html\n<style>a{color:red}</style>\n```');
      const body = parse(html);
      expect(body.querySelector('style')).toBeNull();
      const code = body.querySelector('code');
      expect(code?.textContent?.trim()).toBe('<style>a{color:red}</style>');
    });

    it('does not let an unclosed tag swallow the rest of the document', () => {
      const html = renderMarkdown('```xml\n<unclosed>\n```\n\nafter the fence');
      const body = parse(html);
      const pre = body.querySelector('pre');
      const p = body.querySelector('p');
      expect(p).not.toBeNull();
      expect(pre?.contains(/** @type {Node} */ (p))).toBe(false);
      expect(p?.textContent).toBe('after the fence');
    });

    it('does not double-decode entities already present in the source', () => {
      const html = renderMarkdown('```text\n&lt; is &amp;lt;\n```');
      const body = parse(html);
      const code = body.querySelector('code');
      expect(code?.textContent?.trim()).toBe('&lt; is &amp;lt;');
    });

    it('cannot break out of the language class attribute via the info string', () => {
      const html = renderMarkdown('```js"><img src=x onerror=alert(1)>\nconsole.log(1)\n```');
      const body = parse(html);
      expect(body.querySelector('img')).toBeNull();
      const code = body.querySelector('code');
      expect(code?.className.split(/\s+/)).not.toContain('onerror=alert(1)>');
    });

    it('uses only the first word of the info string as the language', () => {
      const html = renderMarkdown('```js {highlight}\nconsole.log(1);\n```');
      const body = parse(html);
      expect(body.querySelector('code')?.className).toBe('language-js');
    });

    it('still tags the fence with its starting line', () => {
      const html = renderMarkdown('text\n\n```js\ncode\n```');
      expect(html).toContain('<pre data-line="3">');
    });
  });

  describe('data-line attribute injection', () => {
    it('tags a heading with the line it starts on', () => {
      const html = renderMarkdown('intro\n\n# Heading');
      expect(html).toContain('data-line="1"');
      expect(html).toContain('data-line="3"');
    });

    it('tags a paragraph, blockquote, table, and hr with their starting line', () => {
      const html = renderMarkdown('para\n\n> quote\n\n| a |\n| - |\n| 1 |\n\n---');
      expect(html).toMatch(/<p data-line="1">para<\/p>/);
      expect(html).toContain('<blockquote data-line="3"');
      expect(html).toContain('<table data-line="5"');
      expect(html).toContain('<hr data-line="9">');
    });

    it('tags a fenced code block with its starting line', () => {
      const html = renderMarkdown('text\n\n```js\ncode\n```');
      expect(html).toContain('<pre data-line="3">');
    });

    // Known limitation: only the six overridden renderer functions (heading,
    // paragraph, code, blockquote, table, hr) receive data-line — the custom
    // marked.use() config does not override list/listitem, so scroll-sync
    // cannot locate list items by data-line.
    it('does not tag list elements with data-line', () => {
      const html = renderMarkdown('- item one\n- item two');
      expect(html).toContain('<ul>');
      expect(html).not.toMatch(/<ul[^>]*data-line/);
      expect(html).not.toMatch(/<li[^>]*data-line/);
    });

    // Known limitation: _lineStart is only assigned to top-level tokens
    // (renderMarkdown's loop iterates the top-level token list), so a nested
    // block — like a paragraph inside a blockquote — falls back to "".
    it('renders an empty data-line for a nested block inside a blockquote', () => {
      const html = renderMarkdown('> nested paragraph');
      expect(html).toContain('data-line=""');
    });
  });

  describe('XSS / sanitization', () => {
    it('strips a script tag entirely', () => {
      const html = renderMarkdown('before <script>alert(1)</script> after');
      expect(html).not.toContain('<script');
      expect(html).not.toContain('alert(1)');
    });

    it('strips an onerror handler from an injected image', () => {
      const html = renderMarkdown('<img src="x" onerror="alert(1)">');
      expect(html).not.toContain('onerror');
    });

    it('neutralizes a javascript: link', () => {
      const html = renderMarkdown('[click me](javascript:alert(1))');
      expect(html).not.toContain('javascript:');
    });

    it('keeps the data-line attribute through sanitization', () => {
      const html = renderMarkdown('# Heading');
      expect(html).toContain('data-line="1"');
    });
  });

  describe('leading zero-width character handling', () => {
    // Some editors prepend a BOM (or other zero-width character) to a file. marked would
    // otherwise fold it into the first block and fail to recognize e.g. a leading heading.
    // See https://github.com/markedjs/marked/issues/2139.
    it('still recognizes a heading after a leading BOM', () => {
      const html = renderMarkdown('﻿# Heading');
      expect(html).toContain('<h1');
      expect(html).toContain('Heading');
    });

    it('still recognizes a heading after a leading zero-width space', () => {
      const html = renderMarkdown('​# Heading');
      expect(html).toContain('<h1');
    });
  });

  describe('module integrity', () => {
    it('renders DEFAULT_CONTENT without throwing and produces non-empty HTML', () => {
      expect(() => renderMarkdown(DEFAULT_CONTENT)).not.toThrow();
      const html = renderMarkdown(DEFAULT_CONTENT);
      expect(html.length).toBeGreaterThan(0);
      expect(html).toContain('<h1');
    });
  });
});
