import DOMPurify from 'dompurify';
import { describe, expect, it } from 'vitest';
import { htmlToMarkdown } from './html-to-markdown.js';
import { htmlTableToMarkdown } from './html-table-to-markdown.js';

describe('htmlToMarkdown', () => {
  // Sanitization (and therefore the whole converter) only works with a real `window` - see the
  // AGENTS.md note on why XSS/sanitization suites must run as .browser.spec.js. This guards
  // against the file silently landing in the wrong Vitest project.
  it('uses browser-backed sanitization', () => {
    expect(DOMPurify.isSupported).toBe(true);
  });

  it('throws when the input is blank', () => {
    expect(() => htmlToMarkdown('   ')).toThrow('Paste some HTML first.');
  });

  it('throws with a helpful message when nothing survives sanitization', () => {
    expect(() => htmlToMarkdown('<script>alert(1)</script>')).toThrow(
      'Nothing to convert — the pasted HTML had no readable content.'
    );
  });

  it('converts headings h1 through h6', () => {
    const markdown = htmlToMarkdown(
      '<h1>One</h1><h2>Two</h2><h3>Three</h3><h4>Four</h4><h5>Five</h5><h6>Six</h6>'
    );
    expect(markdown).toBe('# One\n\n## Two\n\n### Three\n\n#### Four\n\n##### Five\n\n###### Six');
  });

  it('converts a paragraph with bold, italic, strikethrough, inline code, a titled link, and an image', () => {
    const markdown = htmlToMarkdown(
      '<p>A <b>bold</b> and <i>italic</i> and <s>strike</s> and <code>code</code> and ' +
        '<a href="/x" title="X">link</a> and <img src="/i.png" alt="Img" title="T"></p>'
    );
    expect(markdown).toBe(
      'A **bold** and *italic* and ~~strike~~ and `code` and [link](/x "X") and ![Img](/i.png "T")'
    );
  });

  it('preserves a <br> hard break as two trailing spaces before the newline', () => {
    const markdown = htmlToMarkdown('<p>a<br>b</p>');
    expect(markdown).toBe('a  \nb');
  });

  it('converts a bare top-level inline element with no block wrapper', () => {
    const markdown = htmlToMarkdown('<strong>Just bold</strong>');
    expect(markdown).toBe('**Just bold**');
  });

  it('keeps inline formatting when it sits directly inside a generic container', () => {
    const markdown = htmlToMarkdown('<div>Some <b>bold</b> text</div>');
    expect(markdown).toBe('Some **bold** text');
  });

  it('converts a horizontal rule', () => {
    expect(htmlToMarkdown('<p>Above</p><hr><p>Below</p>')).toBe('Above\n\n---\n\nBelow');
  });

  it('converts a blockquote, including one that wraps multiple paragraphs', () => {
    const markdown = htmlToMarkdown('<blockquote><p>First.</p><p>Second.</p></blockquote>');
    expect(markdown).toBe('> First.\n>\n> Second.');
  });

  it('converts a nested blockquote', () => {
    const markdown = htmlToMarkdown('<blockquote>Outer<blockquote>Inner</blockquote></blockquote>');
    expect(markdown).toBe('> Outer\n>\n> > Inner');
  });

  it('converts a fenced code block and detects its language', () => {
    const markdown = htmlToMarkdown('<pre><code class="language-js">const x = 1;</code></pre>');
    expect(markdown).toBe('```js\nconst x = 1;\n```');
  });

  it('widens the code fence past a backtick run inside the code', () => {
    const markdown = htmlToMarkdown('<pre><code>``already fenced``</code></pre>');
    expect(markdown).toBe('```\n``already fenced``\n```');
  });

  it('widens an inline code span past a backtick inside it', () => {
    const markdown = htmlToMarkdown('<p><code>a`b</code></p>');
    expect(markdown).toBe('``a`b``');
  });

  it('pads an inline code span that starts with a backtick so the fence stays unambiguous', () => {
    const markdown = htmlToMarkdown('<p><code>`leading</code></p>');
    expect(markdown).toBe('`` `leading ``');
  });

  it('converts an unordered list, including a nested list', () => {
    const markdown = htmlToMarkdown('<ul><li>One</li><li>Two<ul><li>Nested</li></ul></li></ul>');
    expect(markdown.split('\n')).toContain('- One');
    expect(markdown).toMatch(/- Nested/);
    // The nested item's marker must be indented to align under the parent's "- " content column.
    const nestedLine = markdown.split('\n').find((line) => line.trim() === '- Nested');
    expect(nestedLine?.startsWith('  ')).toBe(true);
  });

  it('converts an ordered list honoring a start attribute, with deeper indent for a nested list', () => {
    const markdown = htmlToMarkdown(
      '<ol start="3"><li>Third</li><li>Fourth<ol><li>Sub</li></ol></li></ol>'
    );
    expect(markdown).toContain('3. Third');
    expect(markdown).toContain('4. Fourth');
    const subLine = markdown.split('\n').find((line) => line.trim() === '1. Sub');
    // Nested content must align under "4. "'s content column (3 spaces), not a flat 2.
    expect(subLine?.startsWith('   ')).toBe(true);
  });

  it('converts a task list to GFM checkbox items', () => {
    const markdown = htmlToMarkdown(
      '<ul>' +
        '<li><input type="checkbox" checked>Done</li>' +
        '<li><input type="checkbox">Todo</li>' +
        '</ul>'
    );
    expect(markdown).toBe('- [x] Done\n- [ ] Todo');
  });

  it('converts a definition list', () => {
    const markdown = htmlToMarkdown('<dl><dt>Term</dt><dd>Definition.</dd></dl>');
    expect(markdown).toBe('- **Term**\n  Definition.');
  });

  it('converts <details>/<summary> into a bold summary followed by the body', () => {
    const markdown = htmlToMarkdown(
      '<details><summary>More info</summary><p>Hidden text.</p></details>'
    );
    expect(markdown).toBe('**More info**\n\nHidden text.');
  });

  it('flattens elements with no markdown equivalent to their text', () => {
    const markdown = htmlToMarkdown(
      '<p>Press <kbd>Ctrl</kbd>, H<sub>2</sub>O, x<sup>2</sup>, <mark>hi</mark>, <abbr title="HyperText">HTML</abbr></p>'
    );
    expect(markdown).toBe('Press `Ctrl`, H2O, x2, hi, HTML');
  });

  it('escapes stray markdown-significant characters in prose', () => {
    const markdown = htmlToMarkdown(
      '<p>2 * 3 * 4 and snake_case and [brackets] and a ` backtick</p>'
    );
    expect(markdown).toBe('2 \\* 3 \\* 4 and snake\\_case and \\[brackets\\] and a \\` backtick');
  });

  it('escapes a line that would otherwise read as a heading, list, or blockquote', () => {
    const markdown = htmlToMarkdown(
      '<p># not a heading</p><p>- not a list</p><p>> not a quote</p>'
    );
    expect(markdown).toBe('\\# not a heading\n\n\\- not a list\n\n\\> not a quote');
  });

  it('converts a table inside a document using the same output as the dedicated table converter', () => {
    const tableHtml =
      '<table><thead><tr><th>Name</th><th>Role</th></tr></thead>' +
      '<tbody><tr><td>Ada</td><td>Engineer</td></tr></tbody></table>';
    const markdown = htmlToMarkdown(`<h2>People</h2>${tableHtml}<p>End.</p>`);
    const { markdown: tableOnly } = htmlTableToMarkdown(tableHtml);

    expect(markdown).toBe(`## People\n\n${tableOnly}\n\nEnd.`);
  });

  it('converts a table with a colspan identically to the dedicated table converter', () => {
    const tableHtml =
      '<table><tr><td colspan="2">Wide</td></tr><tr><td>x</td><td>y</td></tr></table>';
    const markdown = htmlToMarkdown(tableHtml);
    const { markdown: tableOnly } = htmlTableToMarkdown(tableHtml);
    expect(markdown).toBe(tableOnly);
  });

  it('removes unsafe HTML before conversion', () => {
    const markdown = htmlToMarkdown(
      '<p onclick="alert(1)">Safe <a href="javascript:alert(2)">link</a></p><script>alert(3)</script>'
    );
    expect(markdown).toBe('Safe link');
    expect(markdown).not.toContain('alert');
    expect(markdown).not.toContain('javascript:');
  });

  it('drops the head/style content of a full HTML document and converts only the body', () => {
    const markdown = htmlToMarkdown(
      '<html><head><title>Doc</title><style>p{color:red}</style></head>' +
        '<body><h1>Body heading</h1></body></html>'
    );
    expect(markdown).toBe('# Body heading');
    expect(markdown).not.toContain('color:red');
    expect(markdown).not.toContain('Doc');
  });
});
