import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TIMEZONE,
  DateTimeError,
  confidenceForHistory,
  daysBetween,
  daysOfHistory,
  daysRemainingInYear,
  endOfYearBoundary,
  isValidTimezone,
  startOfDay,
  startOfMonth,
  startOfNextDay,
  toZonedDateParts,
  toZonedDateString,
  zonedTimeToInstant,
} from '@/lib/datetime';

const BKK = DEFAULT_TIMEZONE; // UTC+7, no DST

describe('zoned date parts', () => {
  it('reads the calendar date as seen in the user timezone', () => {
    // 18:00 UTC on Sep 7 is already Sep 8 in Bangkok. A server-local reading
    // would file this transaction on the wrong day.
    const instant = new Date('2026-09-07T18:00:00Z');
    expect(toZonedDateParts(instant, BKK)).toEqual({ year: 2026, month: 9, day: 8 });
    expect(toZonedDateString(instant, BKK)).toBe('2026-09-08');
    expect(toZonedDateString(instant, 'UTC')).toBe('2026-09-07');
  });

  it('pads month and day', () => {
    expect(toZonedDateString(new Date('2026-01-05T03:00:00Z'), BKK)).toBe('2026-01-05');
  });

  it('rejects an unknown timezone', () => {
    expect(() => toZonedDateParts(new Date(), 'Mars/Olympus_Mons')).toThrow(DateTimeError);
    expect(isValidTimezone('Mars/Olympus_Mons')).toBe(false);
    expect(isValidTimezone(BKK)).toBe(true);
  });
});

describe('boundaries', () => {
  it('finds midnight in the user timezone, not UTC', () => {
    const instant = new Date('2026-09-08T14:32:00+07:00');
    expect(startOfDay(instant, BKK).toISOString()).toBe('2026-09-07T17:00:00.000Z');
    expect(startOfNextDay(instant, BKK).toISOString()).toBe('2026-09-08T17:00:00.000Z');
  });

  it('rolls over month and year ends', () => {
    const lastDay = new Date('2026-12-31T20:00:00+07:00');
    expect(startOfNextDay(lastDay, BKK).toISOString()).toBe('2026-12-31T17:00:00.000Z');
    expect(toZonedDateString(startOfNextDay(lastDay, BKK), BKK)).toBe('2027-01-01');
  });

  it('finds the first day of the month for budget periods', () => {
    const instant = new Date('2026-09-08T14:32:00+07:00');
    expect(toZonedDateString(startOfMonth(instant, BKK), BKK)).toBe('2026-09-01');
  });

  it('puts the year boundary at Jan 1 of the following year', () => {
    const instant = new Date('2026-09-08T14:32:00+07:00');
    expect(endOfYearBoundary(instant, BKK).toISOString()).toBe('2026-12-31T17:00:00.000Z');
  });

  it('resolves wall-clock time back to an instant across a DST transition', () => {
    // New York moves to EDT on 2026-03-08. 12:00 local is 16:00Z after the
    // change and would be 17:00Z if the offset were taken from before it.
    const after = zonedTimeToInstant(
      { year: 2026, month: 3, day: 8, hour: 12 },
      'America/New_York',
    );
    expect(after.toISOString()).toBe('2026-03-08T16:00:00.000Z');

    const before = zonedTimeToInstant(
      { year: 2026, month: 3, day: 7, hour: 12 },
      'America/New_York',
    );
    expect(before.toISOString()).toBe('2026-03-07T17:00:00.000Z');
  });
});

describe('daysRemainingInYear', () => {
  it('counts whole days to Dec 31 inclusive', () => {
    // Sep 9-30 (22) + Oct 31 + Nov 30 + Dec 31 = 114, matching the worked
    // example in SPEC §3 S5. Today is excluded — today's spend is already in
    // B_now, so counting it again would double-count one median day.
    expect(daysRemainingInYear(new Date('2026-09-08T09:00:00+07:00'), BKK)).toBe(114);
  });

  it('does not change as the day progresses', () => {
    const morning = new Date('2026-09-08T00:05:00+07:00');
    const night = new Date('2026-09-08T23:55:00+07:00');
    expect(daysRemainingInYear(morning, BKK)).toBe(daysRemainingInYear(night, BKK));
  });

  it('returns 0 on the last day of the year — nothing left to project', () => {
    expect(daysRemainingInYear(new Date('2026-12-31T08:00:00+07:00'), BKK)).toBe(0);
  });

  it('accounts for a leap year', () => {
    // 2028 has 366 days; from Jan 2 to Dec 31 inclusive is 365.
    expect(daysRemainingInYear(new Date('2028-01-01T08:00:00+07:00'), BKK)).toBe(365);
  });
});

describe('history and confidence', () => {
  it('counts whole days between two dates', () => {
    const from = new Date('2026-09-01T23:00:00+07:00');
    const to = new Date('2026-09-08T01:00:00+07:00');
    expect(daysBetween(from, to, BKK)).toBe(7);
  });

  it('counts a single-day history as one day, not zero', () => {
    const day = new Date('2026-09-08T09:00:00+07:00');
    expect(daysOfHistory(day, day, BKK)).toBe(1);
  });

  it('maps history length to the cold-start confidence band', () => {
    // SPEC §3 S5: 0-6 low, 7-29 medium, 30+ high.
    expect(confidenceForHistory(0)).toBe('low');
    expect(confidenceForHistory(6)).toBe('low');
    expect(confidenceForHistory(7)).toBe('medium');
    expect(confidenceForHistory(29)).toBe('medium');
    expect(confidenceForHistory(30)).toBe('high');
  });
});
