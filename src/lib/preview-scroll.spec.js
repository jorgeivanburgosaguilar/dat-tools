import { describe, it, expect } from 'vitest';
import { computePreviewScrollTop, resolveLeadOffsetPx } from './preview-scroll.js';

describe('resolveLeadOffsetPx', () => {
  it('uses parsed pixel line-height values', () => {
    expect(resolveLeadOffsetPx('22.4px')).toBe(22.4);
  });

  it('falls back when line-height is a keyword', () => {
    expect(resolveLeadOffsetPx('normal')).toBe(24);
  });

  it('uses custom fallback when provided', () => {
    expect(resolveLeadOffsetPx(undefined, 20)).toBe(20);
  });
});

describe('computePreviewScrollTop', () => {
  it('applies one-line lead offset before the target section', () => {
    expect(
      computePreviewScrollTop({
        currentScrollTop: 200,
        targetTop: 400,
        containerTop: 300,
        leadOffsetPx: 24,
        scrollHeight: 1200,
        clientHeight: 400
      })
    ).toBe(276);
  });

  it('clamps to top when offset would scroll above 0', () => {
    expect(
      computePreviewScrollTop({
        currentScrollTop: 10,
        targetTop: 20,
        containerTop: 70,
        leadOffsetPx: 24,
        scrollHeight: 800,
        clientHeight: 300
      })
    ).toBe(0);
  });

  it('clamps to max scroll when target would exceed bottom', () => {
    expect(
      computePreviewScrollTop({
        currentScrollTop: 600,
        targetTop: 900,
        containerTop: 100,
        leadOffsetPx: 24,
        scrollHeight: 1200,
        clientHeight: 200
      })
    ).toBe(1000);
  });

  it('returns 0 when there is no scrollable range', () => {
    expect(
      computePreviewScrollTop({
        currentScrollTop: 100,
        targetTop: 300,
        containerTop: 200,
        leadOffsetPx: 24,
        scrollHeight: 400,
        clientHeight: 500
      })
    ).toBe(0);
  });
});
