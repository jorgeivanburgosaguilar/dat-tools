/**
 * Shared math for keeping a line-number gutter aligned with wrapped text. When a logical line
 * wraps onto multiple visual rows, the gutter must reserve that many rows (its number sits on the
 * first one, the rest stay blank) instead of the fixed one-row-per-line height that works only for
 * unwrapped text.
 */

/**
 * Converts measured natural heights into whole gutter rows. Rounding to whole rows (rather than
 * writing fractional px) is what stops sub-pixel error from accumulating down a long file.
 * @param {number[]} heights - Natural rendered height, px, one per logical line.
 * @param {number} lineHeight - Computed line-height, px.
 * @returns {number[]} Row span (>= 1) per logical line.
 */
export function toRowSpans(heights, lineHeight) {
  if (!lineHeight || lineHeight <= 0) return heights.map(() => 1);
  return heights.map((height) => Math.max(1, Math.round(height / lineHeight)));
}

/**
 * Pairwise max across panes, for side-by-side row alignment (e.g. the diff checker's left/right
 * panes, where each logical row pair must share one height).
 * @param {number[][]} perPaneHeights - One array of natural row heights per pane, same length.
 * @returns {number[]} The per-row maximum across all panes.
 */
export function maxRowHeights(perPaneHeights) {
  const rowCount = Math.max(0, ...perPaneHeights.map((heights) => heights.length));
  const merged = new Array(rowCount).fill(0);
  for (const heights of perPaneHeights) {
    for (let i = 0; i < heights.length; i++) {
      if (heights[i] > merged[i]) merged[i] = heights[i];
    }
  }
  return merged;
}
