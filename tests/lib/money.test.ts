import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  MoneyError,
  ZERO,
  abs,
  add,
  assertValidAmount,
  compare,
  equals,
  formatTHB,
  isWithinSanityRange,
  isZero,
  median,
  multiply,
  subtract,
  sum,
  toJSON,
  toMoney,
} from '@/lib/money';

describe('toMoney', () => {
  it('accepts strings, numbers and Decimals', () => {
    expect(toMoney('80').toString()).toBe('80');
    expect(toMoney(80).toString()).toBe('80');
    expect(toMoney(new Prisma.Decimal('80')).toString()).toBe('80');
  });

  it('quantizes to 2 decimal places with ROUND_HALF_UP', () => {
    expect(toMoney('10.005').toString()).toBe('10.01');
    expect(toMoney('10.004').toString()).toBe('10');
    expect(toMoney('-10.005').toString()).toBe('-10.01');
  });

  it('rejects values that are not finite numbers', () => {
    expect(() => toMoney(Number.NaN)).toThrow(MoneyError);
    expect(() => toMoney(Number.POSITIVE_INFINITY)).toThrow(MoneyError);
    expect(() => toMoney('กาแฟ')).toThrow(MoneyError);
  });
});

describe('arithmetic', () => {
  it('avoids binary floating-point drift', () => {
    // The canonical failure: 0.1 + 0.2 === 0.30000000000000004 as a float.
    expect(add('0.1', '0.2').toString()).toBe('0.3');
    expect(subtract('0.3', '0.1').toString()).toBe('0.2');
  });

  it('sums an empty list to zero rather than undefined', () => {
    expect(isZero(sum([]))).toBe(true);
    expect(sum([]).toString()).toBe(ZERO.toString());
  });

  it('sums a mixed list', () => {
    expect(sum(['80', 60, new Prisma.Decimal('1250')]).toString()).toBe('1390');
  });

  it('multiplies by a dimensionless factor', () => {
    // Dec seasonality factor from SPEC §3 S5.
    expect(multiply('420', '1.25').toString()).toBe('525');
  });

  it('compares and tests equality', () => {
    expect(compare('80', '90')).toBe(-1);
    expect(compare('90', '80')).toBe(1);
    expect(compare('80', '80.00')).toBe(0);
    expect(equals('80', '80.004')).toBe(true);
  });

  it('takes an absolute value', () => {
    expect(abs('-1250.50').toString()).toBe('1250.5');
  });
});

describe('median', () => {
  it('returns zero for an empty list', () => {
    expect(isZero(median([]))).toBe(true);
  });

  it('takes the middle value of an odd-length list', () => {
    expect(median(['100', '20', '60']).toString()).toBe('60');
  });

  it('averages the two middle values of an even-length list', () => {
    expect(median(['100', '20', '60', '40']).toString()).toBe('50');
  });

  it('resists the outlier that would drag a mean upward', () => {
    // Four ordinary days plus one rent payment: the mean is 8,076, the median
    // is 80. SPEC §3 S5 requires the median for exactly this reason.
    const days = ['80', '60', '80', '100', '40000'];
    expect(median(days).toString()).toBe('80');
  });

  it('does not mutate the caller list', () => {
    const days = ['100', '20', '60'];
    median(days);
    expect(days).toEqual(['100', '20', '60']);
  });
});

describe('assertValidAmount', () => {
  it('accepts a positive amount', () => {
    expect(assertValidAmount('80').toString()).toBe('80');
  });

  it('rejects zero and negatives — expenses are positive with type=expense', () => {
    expect(() => assertValidAmount('0')).toThrow(MoneyError);
    expect(() => assertValidAmount('-80')).toThrow(MoneyError);
  });

  it('rejects an amount beyond DECIMAL(12,2)', () => {
    expect(() => assertValidAmount('10000000000')).toThrow(MoneyError);
  });
});

describe('isWithinSanityRange', () => {
  // SPEC §3.11.2 T3: 0 < amount <= 10,000,000 for AI-extracted values.
  it('accepts a plausible amount', () => {
    expect(isWithinSanityRange('1250')).toBe(true);
    expect(isWithinSanityRange('10000000')).toBe(true);
  });

  it('rejects a hallucinated amount', () => {
    expect(isWithinSanityRange('0')).toBe(false);
    expect(isWithinSanityRange('-5')).toBe(false);
    expect(isWithinSanityRange('10000001')).toBe(false);
  });
});

describe('formatting', () => {
  it('serializes to a fixed-scale string, never a float', () => {
    expect(toJSON('12400')).toBe('12400.00');
    expect(toJSON('0.1')).toBe('0.10');
  });

  it('formats as Thai baht with two decimals', () => {
    const formatted = formatTHB('12400');
    expect(formatted).toContain('12,400.00');
    expect(formatted).toMatch(/[฿]|THB/);
  });
});

describe('T6 — money precision', () => {
  it('shows no rounding drift across 10,000 sequential operations', () => {
    // AIDO §9 T6. Adding 0.01 ten thousand times must land exactly on 100.00;
    // the same loop with JS numbers drifts into 100.00000000001807.
    let balance = ZERO;
    for (let i = 0; i < 10_000; i += 1) {
      balance = add(balance, '0.01');
    }
    expect(balance.toString()).toBe('100');

    for (let i = 0; i < 10_000; i += 1) {
      balance = subtract(balance, '0.01');
    }
    expect(isZero(balance)).toBe(true);
  });

  it('keeps a realistic ledger exact over 10,000 mixed transactions', () => {
    let balance = toMoney('45200.00');
    for (let i = 0; i < 5_000; i += 1) {
      balance = subtract(balance, '19.99');
      balance = add(balance, '19.99');
    }
    expect(balance.toString()).toBe('45200');
  });
});
