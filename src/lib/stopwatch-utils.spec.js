import { describe, it, expect } from 'vitest';
import { formatTime, formatDate, formatTimeOnly, formatElapsed } from './stopwatch-utils';

describe('formatTime', () => {
  it('formats 0ms as 00:00:00', () => {
    expect(formatTime(0)).toBe('00:00:00');
  });

  it('formats 1000ms as 00:00:01', () => {
    expect(formatTime(1000)).toBe('00:00:01');
  });

  it('formats 60000ms as 00:01:00', () => {
    expect(formatTime(60000)).toBe('00:01:00');
  });

  it('formats 3661000ms as 01:01:01 (hours + minutes + seconds)', () => {
    expect(formatTime(3661000)).toBe('01:01:01');
  });
});

describe('formatDate', () => {
  it('formats a timestamp to yyyy-MM-dd', () => {
    const ts = new Date(2024, 0, 15).getTime(); // Jan 15, 2024 local time
    expect(formatDate(ts)).toBe('2024-01-15');
  });

  it('zero-pads month and day', () => {
    const ts = new Date(2024, 0, 5).getTime(); // Jan 5, 2024 local time
    expect(formatDate(ts)).toBe('2024-01-05');
  });
});

describe('formatTimeOnly', () => {
  it('formats a timestamp to HH:mm:ss with zero-padded parts', () => {
    const ts = new Date(2024, 0, 15, 9, 5, 3).getTime(); // 09:05:03 local time
    expect(formatTimeOnly(ts)).toBe('09:05:03');
  });
});

describe('formatElapsed', () => {
  it('formats 0 minutes as 00:01 (1-minute minimum)', () => {
    expect(formatElapsed(0)).toBe('00:01');
  });

  it('formats 1 minute as 00:01', () => {
    expect(formatElapsed(1)).toBe('00:01');
  });

  it('formats 60 minutes as 01:00', () => {
    expect(formatElapsed(60)).toBe('01:00');
  });

  it('formats 90 minutes as 01:30', () => {
    expect(formatElapsed(90)).toBe('01:30');
  });
});
