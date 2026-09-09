import { describe, it, expect } from 'vitest';
import { money, add, sum, median, divide, formatTHB, ZERO } from '@/lib/money';

describe('money', () => {
  it('adds exactly where binary floating point cannot', () => {
    // The whole reason Decimal exists here: 0.1 + 0.2 === 0.30000000000000004
    expect(add(money('0.1'), money('0.2')).toString()).toBe('0.3');
  });

  it('sums an empty list to zero', () => {
    expect(sum([]).equals(ZERO)).toBe(true);
  });

  describe('median', () => {
    it('is unmoved by a single large outlier', () => {
      // AIDO §11.3: a ฿30,000 laptop must not drag the daily spend estimate up.
      const withOutlier = [money(80), money(120), money(100), money(30000)];
      expect(median(withOutlier).toString()).toBe('110');
    });

    it('averages the middle pair on an even count', () => {
      expect(median([money(10), money(20), money(30), money(40)]).toString()).toBe('25');
    });

    it('returns zero for no data (cold start)', () => {
      expect(median([]).toString()).toBe('0');
    });

    it('does not mutate its input', () => {
      const values = [money(30), money(10), money(20)];
      median(values);
      expect(values.map(String)).toEqual(['30', '10', '20']);
    });
  });

  describe('divide', () => {
    it('rounds to two decimals', () => {
      expect(divide(money(100), money(3)).toString()).toBe('33.33');
    });

    it('throws rather than returning Infinity', () => {
      expect(() => divide(money(100), ZERO)).toThrow(/division by zero/);
    });
  });

  describe('formatTHB', () => {
    it('groups thousands and always shows satang', () => {
      expect(formatTHB(money('12400'))).toBe('฿12,400.00');
      expect(formatTHB(money('1234567.5'))).toBe('฿1,234,567.50');
      expect(formatTHB(money('0'))).toBe('฿0.00');
      expect(formatTHB(money('999'))).toBe('฿999.00');
    });

    it('puts the sign outside the symbol for a negative safe-to-spend', () => {
      expect(formatTHB(money('-1200.5'))).toBe('-฿1,200.50');
    });
  });

  // AIDO §9 T6 — the mandatory money-precision test.
  it('holds exact across 10,000 sequential operations', () => {
    let balance = ZERO;
    for (let i = 0; i < 10_000; i++) balance = add(balance, money('0.01'));
    expect(balance.toString()).toBe('100');

    for (let i = 0; i < 10_000; i++) balance = add(balance, money('-0.01'));
    expect(balance.isZero()).toBe(true);
  });
});
