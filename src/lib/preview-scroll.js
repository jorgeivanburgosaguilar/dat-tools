const FALLBACK_LEAD_OFFSET_PX = 24;

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * @param {string | number | null | undefined} lineHeightValue
 * @param {number} [fallbackPx]
 * @returns {number}
 */
export function resolveLeadOffsetPx(lineHeightValue, fallbackPx = FALLBACK_LEAD_OFFSET_PX) {
  if (typeof lineHeightValue === 'number') {
    return Number.isFinite(lineHeightValue) && lineHeightValue > 0 ? lineHeightValue : fallbackPx;
  }

  const parsed = Number.parseFloat(lineHeightValue ?? '');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackPx;
}

/**
 * @typedef {Object} PreviewScrollParams
 * @property {number} currentScrollTop
 * @property {number} targetTop
 * @property {number} containerTop
 * @property {number} leadOffsetPx
 * @property {number} scrollHeight
 * @property {number} clientHeight
 */

/**
 * @param {PreviewScrollParams} params
 * @returns {number}
 */
export function computePreviewScrollTop(params) {
  const maxScrollTop = Math.max(0, params.scrollHeight - params.clientHeight);
  const rawTarget =
    params.currentScrollTop + (params.targetTop - params.containerTop) - params.leadOffsetPx;

  return clamp(rawTarget, 0, maxScrollTop);
}
