/**
 * Timezone helpers. AIDO §5.4 D2: never assume the server's clock. A user in
 * Asia/Bangkok whose "today" is computed in UTC gets their daily jobs and
 * their days-remaining count wrong by up to seven hours.
 */

export const DEFAULT_TIMEZONE = 'Asia/Bangkok';

/** Calendar parts of `instant` as seen in `timeZone`. */
export function partsIn(
  instant: Date,
  timeZone: string = DEFAULT_TIMEZONE,
): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = fmt.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((p) => p.type === type);
    if (!found) throw new Error(`datetime: missing "${type}" for zone ${timeZone}`);
    return Number(found.value);
  };

  return { year: get('year'), month: get('month'), day: get('day') };
}

/** Number of days in the user's current calendar month. */
export function daysInMonth(instant: Date, timeZone: string = DEFAULT_TIMEZONE): number {
  const { year, month } = partsIn(instant, timeZone);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * `D` in the forecast formulas: days remaining until the last day of the
 * current month, counted from the forecast run date.
 *
 * Today counts as remaining — on the last day of the month D is 1, never 0, so
 * the safe-to-spend division never blows up (SPEC §S5 Level 1.5).
 */
export function daysRemainingInMonth(
  instant: Date,
  timeZone: string = DEFAULT_TIMEZONE,
): number {
  const { day } = partsIn(instant, timeZone);
  return daysInMonth(instant, timeZone) - day + 1;
}

/** First day of the user's current month, as the UTC instant of 00:00 local. */
export function startOfMonth(instant: Date, timeZone: string = DEFAULT_TIMEZONE): Date {
  const { year, month } = partsIn(instant, timeZone);
  return zonedMidnight(year, month, 1, timeZone);
}

/** The instant corresponding to local midnight of the given calendar date. */
export function zonedMidnight(
  year: number,
  month: number,
  day: number,
  timeZone: string = DEFAULT_TIMEZONE,
): Date {
  const naiveUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  // Measure the zone's offset at that instant, then shift by it.
  const offsetMs = tzOffsetMs(new Date(naiveUtc), timeZone);
  return new Date(naiveUtc - offsetMs);
}

function tzOffsetMs(instant: Date, timeZone: string): number {
  const asUtc = new Date(instant.toLocaleString('en-US', { timeZone: 'UTC' }));
  const asZoned = new Date(instant.toLocaleString('en-US', { timeZone }));
  return asZoned.getTime() - asUtc.getTime();
}
