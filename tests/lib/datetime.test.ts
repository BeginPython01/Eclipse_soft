import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TIMEZONE,
  daysInMonth,
  daysRemainingInMonth,
  partsIn,
  startOfMonth,
} from '@/lib/datetime';

describe('datetime', () => {
  it('reads calendar parts in the user timezone, not the server one', () => {
    // 2026-09-09T18:30Z is already Sep 10 in Bangkok (UTC+7).
    const instant = new Date('2026-09-09T18:30:00Z');
    expect(partsIn(instant, DEFAULT_TIMEZONE)).toEqual({ year: 2026, month: 9, day: 10 });
    expect(partsIn(instant, 'UTC')).toEqual({ year: 2026, month: 9, day: 9 });
  });

  it('knows month lengths including leap February', () => {
    expect(daysInMonth(new Date('2026-09-15T00:00:00Z'))).toBe(30);
    expect(daysInMonth(new Date('2026-02-15T00:00:00Z'))).toBe(28);
    expect(daysInMonth(new Date('2028-02-15T00:00:00Z'))).toBe(29);
  });

  describe('daysRemainingInMonth (D in the forecast formulas)', () => {
    it('counts today as remaining', () => {
      // Sep 10 of a 30-day month → 21 days left including today.
      expect(daysRemainingInMonth(new Date('2026-09-10T03:00:00Z'))).toBe(21);
    });

    it('never returns zero on the last day of the month', () => {
      // Safe-to-spend divides by D — a zero here would blow up the forecast.
      expect(daysRemainingInMonth(new Date('2026-09-30T10:00:00Z'))).toBe(1);
    });

    it('is 30 on the first of a 30-day month', () => {
      expect(daysRemainingInMonth(new Date('2026-09-01T02:00:00Z'))).toBe(30);
    });
  });

  it('anchors the month start to local midnight, not UTC midnight', () => {
    const start = startOfMonth(new Date('2026-09-20T00:00:00Z'));
    // 00:00 on Sep 1 in Bangkok is 17:00 on Aug 31 UTC.
    expect(start.toISOString()).toBe('2026-08-31T17:00:00.000Z');
    expect(partsIn(start, DEFAULT_TIMEZONE)).toEqual({ year: 2026, month: 9, day: 1 });
  });
});
