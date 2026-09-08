/**
 * Money helpers (AIDO §5.1).
 *
 * Every value that affects a balance or a forecast passes through here.
 * `Prisma.Decimal` is the only representation — JavaScript `number`
 * arithmetic on money is forbidden, because 0.1 + 0.2 !== 0.3 and a cent
 * of drift per transaction becomes real money at scale.
 *
 * Rules enforced by this module:
 *   - amounts are stored positive; direction lives in `type`/`direction`
 *   - every result is quantized to 2 decimal places, ROUND_HALF_UP
 *   - a `number` may only enter at a boundary (parsed input, a literal),
 *     never as the accumulator of a running total
 */
import { Prisma } from '@prisma/client';

export type Money = Prisma.Decimal;

/** What may be converted into Money. `number` is a boundary-only convenience. */
export type MoneyInput = string | number | Prisma.Decimal;

/** Database column is DECIMAL(12,2): 10 digits before the point, 2 after. */
export const MONEY_SCALE = 2;
export const MONEY_MAX = new Prisma.Decimal('9999999999.99');

/** SPEC §3.11.2 T3 sanity bound for any extracted amount. */
export const AMOUNT_SANITY_MAX = new Prisma.Decimal('10000000');

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

/**
 * Convert to Money and quantize to 2dp.
 *
 * Rejects NaN, Infinity, and non-numeric strings rather than silently
 * producing a wrong number — a throw is recoverable, a bad balance is not.
 */
export function toMoney(value: MoneyInput): Money {
  let decimal: Prisma.Decimal;

  try {
    decimal = value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
  } catch {
    throw new MoneyError(`Not a valid monetary value: ${String(value)}`);
  }

  if (!decimal.isFinite()) {
    throw new MoneyError(`Monetary value must be finite: ${String(value)}`);
  }

  return decimal.toDecimalPlaces(MONEY_SCALE, Prisma.Decimal.ROUND_HALF_UP);
}

export const ZERO: Money = toMoney(0);

export function add(a: MoneyInput, b: MoneyInput): Money {
  return toMoney(toMoney(a).plus(toMoney(b)));
}

export function subtract(a: MoneyInput, b: MoneyInput): Money {
  return toMoney(toMoney(a).minus(toMoney(b)));
}

/**
 * Multiply money by a dimensionless factor (a seasonality factor, a day
 * count). The factor is deliberately not Money — money times money is not
 * money.
 */
export function multiply(amount: MoneyInput, factor: MoneyInput): Money {
  return toMoney(toMoney(amount).times(toMoney(factor)));
}

/** Sum a list. Returns ZERO for an empty list — never undefined. */
export function sum(values: readonly MoneyInput[]): Money {
  return values.reduce<Money>((acc, value) => add(acc, value), ZERO);
}

/**
 * Median, not mean (AIDO §14, SPEC §3 S5): a single ฿40,000 rent payment
 * must not drag the "typical day" upward. An even-length list averages the
 * two middle values.
 */
export function median(values: readonly MoneyInput[]): Money {
  if (values.length === 0) return ZERO;

  const sorted = values.map(toMoney).sort((a, b) => a.comparedTo(b));
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle] as Money;
  }

  const lower = sorted[middle - 1] as Money;
  const upper = sorted[middle] as Money;
  return toMoney(lower.plus(upper).dividedBy(2));
}

/** -1 if a < b, 0 if equal, 1 if a > b. */
export function compare(a: MoneyInput, b: MoneyInput): -1 | 0 | 1 {
  return toMoney(a).comparedTo(toMoney(b)) as -1 | 0 | 1;
}

export function equals(a: MoneyInput, b: MoneyInput): boolean {
  return compare(a, b) === 0;
}

export function isNegative(value: MoneyInput): boolean {
  return toMoney(value).isNegative();
}

export function isZero(value: MoneyInput): boolean {
  return toMoney(value).isZero();
}

export function abs(value: MoneyInput): Money {
  return toMoney(toMoney(value).abs());
}

/**
 * Validate a transaction amount before persistence.
 * Amounts are always stored positive (AIDO §14); a negative expense is a bug,
 * not a representation choice.
 */
export function assertValidAmount(value: MoneyInput): Money {
  const amount = toMoney(value);

  if (!amount.greaterThan(0)) {
    throw new MoneyError(`Amount must be positive, got ${amount.toString()}`);
  }
  if (amount.greaterThan(MONEY_MAX)) {
    throw new MoneyError(`Amount exceeds DECIMAL(12,2) range: ${amount.toString()}`);
  }

  return amount;
}

/**
 * Sanity range for an amount produced by AI extraction (SPEC §3.11.2 T3).
 * Kept separate from `assertValidAmount` so the AI bound can tighten without
 * touching manual entry.
 */
export function isWithinSanityRange(value: MoneyInput): boolean {
  const amount = toMoney(value);
  return amount.greaterThan(0) && amount.lessThanOrEqualTo(AMOUNT_SANITY_MAX);
}

/** Display as `฿12,400.00` (SPEC §3 S2). */
export function formatTHB(value: MoneyInput): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: MONEY_SCALE,
    maximumFractionDigits: MONEY_SCALE,
  }).format(toMoney(value).toNumber());
}

/**
 * Serialize for a JSON response. A Decimal must never reach the client as a
 * float — it crosses the wire as a fixed-scale string.
 */
export function toJSON(value: MoneyInput): string {
  return toMoney(value).toFixed(MONEY_SCALE);
}
