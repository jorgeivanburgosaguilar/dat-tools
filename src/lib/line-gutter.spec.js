import { describe, it, expect } from 'vitest';
import { toRowSpans, maxRowHeights } from './line-gutter.js';

describe('toRowSpans', () => {
  it('gives every line exactly one row when heights match the line height', () => {
    expect(toRowSpans([20, 20, 20], 20)).toEqual([1, 1, 1]);
  });

  it('rounds a wrapped line up to the number of visual rows it occupies', () => {
    expect(toRowSpans([20, 40, 60], 20)).toEqual([1, 2, 3]);
  });

  it('rounds sub-pixel measurement noise to the nearest whole row instead of drifting', () => {
    expect(toRowSpans([19.6, 39.8, 60.2], 20)).toEqual([1, 2, 3]);
  });

  it('never returns fewer than one row, even for a zero-height measurement', () => {
    expect(toRowSpans([0], 20)).toEqual([1]);
  });

  it('falls back to one row per line when lineHeight is not yet known', () => {
    expect(toRowSpans([20, 40, 0], 0)).toEqual([1, 1, 1]);
  });

  it('returns an empty array for empty input', () => {
    expect(toRowSpans([], 20)).toEqual([]);
  });
});

describe('maxRowHeights', () => {
  it('takes the pairwise max across panes of equal length', () => {
    expect(
      maxRowHeights([
        [20, 40, 20],
        [20, 20, 60]
      ])
    ).toEqual([20, 40, 60]);
  });

  it('handles a single pane by returning it unchanged', () => {
    expect(maxRowHeights([[20, 40]])).toEqual([20, 40]);
  });

  it('treats a missing row in a shorter pane as zero, not as absent', () => {
    expect(maxRowHeights([[20, 40, 60], [20]])).toEqual([20, 40, 60]);
  });

  it('returns an empty array when there are no panes', () => {
    expect(maxRowHeights([])).toEqual([]);
  });

  it('returns an empty array when all panes are empty', () => {
    expect(maxRowHeights([[], []])).toEqual([]);
  });
});
