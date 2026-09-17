import { describe, expect, it } from 'vitest';
import { formatLocalDate, formatLocalDateForDisplay, parseLocalDate } from './date';

describe('local date utilities', () => {
  it('round-trips a local calendar date without a timezone conversion', () => {
    const date = parseLocalDate('2028-02-29');

    expect(date).toBeDefined();
    expect(formatLocalDate(date!)).toBe('2028-02-29');
  });

  it('rejects malformed and impossible dates', () => {
    expect(parseLocalDate('2026-2-09')).toBeUndefined();
    expect(parseLocalDate('2026-02-29')).toBeUndefined();
    expect(parseLocalDate(null)).toBeUndefined();
  });

  it('formats API dates for compact display', () => {
    expect(formatLocalDateForDisplay('2026-09-07')).toBe('2026/9/7');
  });
});
