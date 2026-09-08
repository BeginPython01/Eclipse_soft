/**
 * Timezone helpers (AIDO §14: never `new Date()` for a user-facing schedule).
 *
 * Every user carries their own `timezone` (default Asia/Bangkok). A forecast
 * that says "114 days remaining" must count days in the *user's* calendar,
 * not the server's — otherwise the number silently shifts by one for anyone
 * near a date boundary.
 *
 * Implemented on the built-in Intl API rather than a date library: the stack
 * is locked (AIDO §3) and this is the whole surface we need.
 */

export const DEFAULT_TIMEZONE = 'Asia/Bangkok';

export interface ZonedDateParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

export class DateTimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DateTimeError';
  }
}

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = partsFormatterCache.get(timeZone);
  if (cached) return cached;

  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    throw new DateTimeError(`Unknown timezone: ${timeZone}`);
  }

  partsFormatterCache.set(timeZone, formatter);
  return formatter;
}

function readParts(instant: Date, timeZone: string): Record<string, number> {
  const parts: Record<string, number> = {};
  for (const { type, value } of partsFormatter(timeZone).formatToParts(instant)) {
    if (type !== 'literal') parts[type] = Number(value);
  }
  return parts;
}

/** The calendar date an instant falls on, as seen in `timeZone`. */
export function toZonedDateParts(instant: Date, timeZone: string): ZonedDateParts {
  const parts = readParts(instant, timeZone);
  return {
    year: parts.year as number,
    month: parts.month as number,
    day: parts.day as number,
  };
}

/** `YYYY-MM-DD` in the user's timezone — the key for any per-day grouping. */
export function toZonedDateString(instant: Date, timeZone: string): string {
  const { year, month, day } = toZonedDateParts(instant, timeZone);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * The UTC offset of `timeZone` at `instant`, in minutes.
 * Computed by comparing wall-clock parts against the same instant read as UTC,
 * so it stays correct across DST transitions in any zone.
 */
function offsetMinutes(instant: Date, timeZone: string): number {
  const p = readParts(instant, timeZone);
  const asUtc = Date.UTC(
    p.year as number,
    (p.month as number) - 1,
    p.day as number,
    p.hour as number,
    p.minute as number,
    p.second as number,
  );
  return (asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000;
}

/**
 * The instant at which a given wall-clock time occurs in `timeZone`.
 * Resolved in two passes: the first offset guess is refined once, which
 * settles the DST edge cases where the guess lands on the wrong side.
 */
export function zonedTimeToInstant(
  parts: ZonedDateParts & { hour?: number; minute?: number; second?: number },
  timeZone: string,
): Date {
  const naive = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
  );

  const firstGuess = new Date(naive - offsetMinutes(new Date(naive), timeZone) * 60_000);
  return new Date(naive - offsetMinutes(firstGuess, timeZone) * 60_000);
}

/** Midnight at the start of the day `instant` falls on, in `timeZone`. */
export function startOfDay(instant: Date, timeZone: string): Date {
  return zonedTimeToInstant(toZonedDateParts(instant, timeZone), timeZone);
}

/** Midnight at the start of the following day — an exclusive upper bound. */
export function startOfNextDay(instant: Date, timeZone: string): Date {
  const { year, month, day } = toZonedDateParts(instant, timeZone);
  return zonedTimeToInstant({ year, month, day: day + 1 }, timeZone);
}

/** First day of the month `instant` falls on — the `period_month` key for budgets. */
export function startOfMonth(instant: Date, timeZone: string): Date {
  const { year, month } = toZonedDateParts(instant, timeZone);
  return zonedTimeToInstant({ year, month, day: 1 }, timeZone);
}

/** Midnight on Jan 1 of the following year — the forecast horizon. */
export function endOfYearBoundary(instant: Date, timeZone: string): Date {
  const { year } = toZonedDateParts(instant, timeZone);
  return zonedTimeToInstant({ year: year + 1, month: 1, day: 1 }, timeZone);
}

const MS_PER_DAY = 86_400_000;

/**
 * `D` in the forecast formula (SPEC §3 S5): the number of *future* days whose
 * spending is still to be projected.
 *
 * Today is excluded. Whatever has been spent today is already inside
 * `B_now`, so counting today again would add one median day of spend that has
 * partly happened — SPEC's worked example (Sep 8 → 114, not 115) settles it
 * this way. On Dec 31 the answer is 0: there is nothing left to project.
 *
 * Counted from calendar boundaries rather than elapsed milliseconds so the
 * value does not drift as the day progresses — a forecast computed at 09:00
 * and one at 23:00 on the same date must project the same horizon.
 */
export function daysRemainingInYear(instant: Date, timeZone: string): number {
  const tomorrow = startOfNextDay(instant, timeZone);
  const boundary = endOfYearBoundary(instant, timeZone);
  return Math.round((boundary.getTime() - tomorrow.getTime()) / MS_PER_DAY);
}

export function daysBetween(from: Date, to: Date, timeZone: string): number {
  const a = startOfDay(from, timeZone);
  const b = startOfDay(to, timeZone);
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

/** Days of history available — drives the cold-start confidence band. */
export function daysOfHistory(firstTransaction: Date, now: Date, timeZone: string): number {
  return daysBetween(firstTransaction, now, timeZone) + 1;
}

export type ForecastConfidence = 'low' | 'medium' | 'high';

/**
 * Cold-start policy (SPEC §3 S5). Confidence must be visible on every
 * forecast display, so it is derived here rather than at each call site.
 */
export function confidenceForHistory(days: number): ForecastConfidence {
  if (days < 7) return 'low';
  if (days < 30) return 'medium';
  return 'high';
}

export function isValidTimezone(timeZone: string): boolean {
  try {
    partsFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}
