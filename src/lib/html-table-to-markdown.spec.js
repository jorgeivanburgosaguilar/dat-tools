import { describe, it, expect } from 'vitest';
import { buildMarkdownTable } from './html-table-to-markdown.js';

describe('buildMarkdownTable', () => {
  it('builds a table from a header and rows', () => {
    const md = buildMarkdownTable(['A', 'B'], [['1', '2']]);
    expect(md).toBe('| A   | B   |\n| --- | --- |\n| 1   | 2   |');
  });

  it('pads ragged rows to the widest row', () => {
    const md = buildMarkdownTable(['A', 'B', 'C'], [['1'], ['2', '3', '4', '5']]);
    expect(md).toBe(
      '| A   | B   | C   |     |\n' +
        '| --- | --- | --- | --- |\n' +
        '| 1   |     |     |     |\n' +
        '| 2   | 3   | 4   | 5   |'
    );
  });

  it('emits an empty header row when header is null', () => {
    const md = buildMarkdownTable(null, [['1', '2']]);
    expect(md).toBe('|     |     |\n| --- | --- |\n| 1   | 2   |');
  });

  it('returns an empty string when there are no rows', () => {
    expect(buildMarkdownTable(['A'], [])).toBe('');
  });

  it('returns an empty string when header and rows are both empty', () => {
    expect(buildMarkdownTable(null, [])).toBe('');
  });

  it('handles a single-column table', () => {
    const md = buildMarkdownTable(['Name'], [['Alice'], ['Bob']]);
    expect(md).toBe('| Name  |\n| ----- |\n| Alice |\n| Bob   |');
  });

  it('pads each column to its own widest cell, independent of other columns', () => {
    const md = buildMarkdownTable(['Language', 'Typing'], [['JavaScript', 'Dynamic']]);
    expect(md).toBe('| Language   | Typing  |\n| ---------- | ------- |\n| JavaScript | Dynamic |');
  });
});
