import { Prisma } from '@prisma/client';

/**
 * Money helpers. AIDO §5.1 M1: monetary values are Decimal end to end.
 *
 * The failure this prevents is not theoretical — 0.1 + 0.2 !== 0.3 in binary
 * floating point, and a balance built from thousands of such additions drifts
 * away from the truth with no error anywhere.
 */

export type Money = Prisma.Decimal;

export const Money = Prisma.Decimal;

/** Money literal. Pass strings for exact values — `money('0.1')`, not `money(0.1)`. */
export function money(value: string | number | Prisma.Decimal): Money {
  return new Prisma.Decimal(value);
}

export const ZERO: Money = money(0);

export function add(a: Money, b: Money): Money {
  return a.plus(b);
}

export function subtract(a: Money, b: Money): Money {
  return a.minus(b);
}

export function sum(values: readonly Money[]): Money {
  return values.reduce<Money>((acc, v) => acc.plus(v), money(0));
}

/**
 * Median, not mean. AIDO §11.3: one ฿30,000 laptop would drag a mean daily
 * spend up for the rest of the month and make every forecast pessimistic.
 */
export function median(values: readonly Money[]): Money {
  if (values.length === 0) return money(0);

  const sorted = [...values].sort((a, b) => a.comparedTo(b));
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) return sorted[mid]!;
  return sorted[mid - 1]!.plus(sorted[mid]!).dividedBy(2);
}

/** Divide, rounding to 2 decimals. Throws rather than returning Infinity. */
export function divide(a: Money, b: Money): Money {
  if (b.isZero()) throw new Error('money.divide: division by zero');
  return a.dividedBy(b).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function isPositive(a: Money): boolean {
  return a.greaterThan(0);
}

/** Display only. AIDO §5.1 M6: never round in storage. → "฿12,400.00" */
export function formatTHB(value: Money): string {
  const negative = value.isNegative();
  const [whole = '0', fraction = '00'] = value.abs().toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}฿${grouped}.${fraction}`;
}
