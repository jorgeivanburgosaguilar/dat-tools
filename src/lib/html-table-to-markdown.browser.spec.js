import { describe, it, expect } from 'vitest';
import { htmlTableToMarkdown, cellToMarkdown } from './html-table-to-markdown.js';

describe('htmlTableToMarkdown', () => {
  it('throws when the input is blank', () => {
    expect(() => htmlTableToMarkdown('   ')).toThrow('Paste some HTML first.');
  });

  it('throws when there is no table in the HTML', () => {
    expect(() => htmlTableToMarkdown('<p>no table here</p>')).toThrow(
      'No <table> found in the pasted HTML.'
    );
  });

  it('converts a thead > th table', () => {
    const html =
      '<table><thead><tr><th>Name</th><th>Age</th></tr></thead>' +
      '<tbody><tr><td>Alice</td><td>30</td></tr></tbody></table>';
    const { markdown, tableCount } = htmlTableToMarkdown(html);
    expect(tableCount).toBe(1);
    expect(markdown).toBe('| Name  | Age |\n| ----- | --- |\n| Alice | 30  |');
  });

  it('converts a thead > td table', () => {
    const html =
      '<table><thead><tr><td>Name</td><td>Age</td></tr></thead>' +
      '<tbody><tr><td>Bob</td><td>25</td></tr></tbody></table>';
    const { markdown } = htmlTableToMarkdown(html);
    expect(markdown).toBe('| Name | Age |\n| ---- | --- |\n| Bob  | 25  |');
  });

  it('treats a first row of th cells as the header when there is no thead', () => {
    const html = '<table><tr><th>Name</th><th>Age</th></tr><tr><td>Cy</td><td>40</td></tr></table>';
    const { markdown } = htmlTableToMarkdown(html);
    expect(markdown).toBe('| Name | Age |\n| ---- | --- |\n| Cy   | 40  |');
  });

  it('falls back to an empty header when no header row exists', () => {
    const html = '<table><tr><td>a</td><td>b</td></tr></table>';
    const { markdown } = htmlTableToMarkdown(html);
    expect(markdown).toBe('|     |     |\n| --- | --- |\n| a   | b   |');
  });

  it('expands colspan into repeated cells', () => {
    const html = '<table><tr><td colspan="2">Wide</td></tr><tr><td>x</td><td>y</td></tr></table>';
    const { markdown } = htmlTableToMarkdown(html);
    expect(markdown).toBe('|      |      |\n| ---- | ---- |\n| Wide | Wide |\n| x    | y    |');
  });

  it('expands rowspan into the following row', () => {
    const html = '<table><tr><td rowspan="2">Tall</td><td>a</td></tr><tr><td>b</td></tr></table>';
    const { markdown } = htmlTableToMarkdown(html);
    expect(markdown).toBe('|      |     |\n| ---- | --- |\n| Tall | a   |\n| Tall | b   |');
  });

  it('pads ragged rows instead of erroring', () => {
    const html = '<table><tr><td>a</td><td>b</td><td>c</td></tr><tr><td>1</td></tr></table>';
    const { markdown } = htmlTableToMarkdown(html);
    expect(markdown).toBe(
      '|     |     |     |\n| --- | --- | --- |\n| a   | b   | c   |\n| 1   |     |     |'
    );
  });

  it('escapes a pipe inside a cell instead of breaking the table', () => {
    const html = '<table><tr><td>a|b</td><td>c</td></tr></table>';
    const { markdown } = htmlTableToMarkdown(html);
    expect(markdown).toBe('|      |     |\n| ---- | --- |\n| a\\|b | c   |');
  });

  it('maps inline tags to markdown syntax', () => {
    const html =
      '<table><tr><td><b>bold</b></td><td><i>em</i></td><td><code>x</code></td>' +
      '<td><a href="/docs">link</a></td><td>line1<br>line2</td></tr></table>';
    const { markdown } = htmlTableToMarkdown(html);
    expect(markdown.split('\n')[2]).toBe(
      '| **bold** | *em* | `x` | [link](/docs) | line1<br>line2 |'
    );
  });

  it('converts multiple top-level tables and joins them with a blank line', () => {
    const html =
      '<table><tr><td>1</td></tr></table><p>between</p><table><tr><td>2</td></tr></table>';
    const { markdown, tableCount } = htmlTableToMarkdown(html);
    expect(tableCount).toBe(2);
    expect(markdown).toBe('|     |\n| --- |\n| 1   |\n\n|     |\n| --- |\n| 2   |');
  });

  it('does not double-emit a nested table', () => {
    const html = '<table><tr><td>outer<table><tr><td>inner</td></tr></table></td></tr></table>';
    const { markdown, tableCount } = htmlTableToMarkdown(html);
    expect(tableCount).toBe(1);
    expect(markdown).toBe('|            |\n| ---------- |\n| outerinner |');
  });

  it('strips script tags and event-handler attributes during sanitization', () => {
    const html =
      '<table><tr><td><img src="x" onerror="alert(1)"></td><td><script>alert(2)</script>safe</td></tr></table>';
    const { markdown } = htmlTableToMarkdown(html);
    expect(markdown).not.toContain('onerror');
    expect(markdown).not.toContain('alert');
    expect(markdown).toContain('safe');
  });

  it('drops a javascript: href', () => {
    const html = '<table><tr><td><a href="javascript:alert(1)">click</a></td></tr></table>';
    const { markdown } = htmlTableToMarkdown(html);
    expect(markdown).not.toContain('javascript:');
  });
});

describe('cellToMarkdown', () => {
  it('collapses internal whitespace and trims', () => {
    const el = document.createElement('td');
    el.innerHTML = '  hello   \n  world  ';
    expect(cellToMarkdown(el)).toBe('hello world');
  });
});
