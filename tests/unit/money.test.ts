import { describe, expect, it } from 'vitest';
import {
  centsToInputValue,
  formatMoney,
  formatMoneyForFilename,
  parseAmountToCents,
  splitTaxInclusive,
  sumCents,
  totalsReconcile,
} from '@/lib/money';

describe('parseAmountToCents', () => {
  it('reads South African formatting (space thousands, comma decimal)', () => {
    expect(parseAmountToCents('1 234,56')).toBe(123456);
    expect(parseAmountToCents('R 1 234,56')).toBe(123456);
    expect(parseAmountToCents('R1 234,56')).toBe(123456);
    expect(parseAmountToCents('207,92')).toBe(20792);
  });

  it('reads anglo-american formatting (comma thousands, dot decimal)', () => {
    expect(parseAmountToCents('1,234.56')).toBe(123456);
    expect(parseAmountToCents('$1,234.56', 'USD')).toBe(123456);
    expect(parseAmountToCents('207.92')).toBe(20792);
  });

  it('reads European formatting (dot thousands, comma decimal)', () => {
    expect(parseAmountToCents('1.234,56')).toBe(123456);
  });

  it('handles whole numbers and single amounts', () => {
    expect(parseAmountToCents('45')).toBe(4500);
    expect(parseAmountToCents('0')).toBe(0);
    expect(parseAmountToCents(12.5)).toBe(1250);
  });

  it('treats bracketed and signed values as negative', () => {
    expect(parseAmountToCents('(45,00)')).toBe(-4500);
    expect(parseAmountToCents('-45,00')).toBe(-4500);
  });

  it('rejects things that are not amounts', () => {
    expect(parseAmountToCents('')).toBeNull();
    expect(parseAmountToCents('   ')).toBeNull();
    expect(parseAmountToCents('abc')).toBeNull();
    expect(parseAmountToCents(null)).toBeNull();
    expect(parseAmountToCents(undefined)).toBeNull();
    expect(parseAmountToCents(Number.NaN)).toBeNull();
    expect(parseAmountToCents(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('rounds half up at the cent, never using binary floating point', () => {
    expect(parseAmountToCents('0.005')).toBe(1);
    expect(parseAmountToCents('1.005')).toBe(101);
    expect(parseAmountToCents('2.675')).toBe(268);
  });

  it('survives a round trip through the input format', () => {
    for (const cents of [0, 1, 99, 100, 20792, 123456, 99999999]) {
      expect(parseAmountToCents(centsToInputValue(cents))).toBe(cents);
    }
  });
});

describe('formatMoney', () => {
  const nbsp = ' ';

  it('uses the South African convention for rand', () => {
    expect(formatMoney(123456, 'ZAR')).toBe(`R${nbsp}1${nbsp}234,56`);
    expect(formatMoney(20792, 'ZAR')).toBe(`R${nbsp}207,92`);
    expect(formatMoney(0, 'ZAR')).toBe(`R${nbsp}0,00`);
  });

  it('uses dot decimals for other currencies', () => {
    expect(formatMoney(123456, 'USD')).toBe(`$${nbsp}1${nbsp}234.56`);
    expect(formatMoney(123456, 'GBP')).toBe(`£${nbsp}1${nbsp}234.56`);
  });

  it('marks negatives and unknown values clearly', () => {
    expect(formatMoney(-20792, 'ZAR')).toBe(`-R${nbsp}207,92`);
    expect(formatMoney(null, 'ZAR')).toBe(`R${nbsp}—`);
  });

  it('can omit the symbol', () => {
    expect(formatMoney(20792, 'ZAR', { withSymbol: false })).toBe('207,92');
  });
});

describe('formatMoneyForFilename', () => {
  it('produces a filename-safe amount', () => {
    expect(formatMoneyForFilename(24590, 'ZAR')).toBe('R245-90');
    expect(formatMoneyForFilename(20792, 'ZAR')).toBe('R207-92');
    expect(formatMoneyForFilename(null, 'ZAR')).toBe('no-total');
  });
});

describe('sumCents', () => {
  it('adds exactly, with no floating point drift', () => {
    // 0.1 + 0.2 in floats is famously not 0.3; in minor units it always is.
    expect(sumCents([10, 20])).toBe(30);
    expect(sumCents([1, 2, 3, null, undefined])).toBe(6);
    expect(sumCents([])).toBe(0);

    const manySmall = Array.from({ length: 1000 }, () => 1);
    expect(sumCents(manySmall)).toBe(1000);
  });
});

describe('splitTaxInclusive', () => {
  it('splits a VAT-inclusive total exactly', () => {
    const { taxCents, subtotalCents } = splitTaxInclusive(11500, 15);
    expect(taxCents).toBe(1500);
    expect(subtotalCents).toBe(10000);
    expect(taxCents + subtotalCents).toBe(11500);
  });

  it('always reconciles, even when rounding is needed', () => {
    for (const total of [20792, 9999, 1, 333, 123457]) {
      const { taxCents, subtotalCents } = splitTaxInclusive(total, 15);
      expect(taxCents + subtotalCents).toBe(total);
    }
  });
});

describe('totalsReconcile', () => {
  it('confirms a matching set', () => {
    expect(totalsReconcile(18080, 2712, 20792)).toBe(true);
  });

  it('flags a mismatch', () => {
    expect(totalsReconcile(18080, 2712, 20793)).toBe(false);
  });

  it('says nothing when there is not enough information', () => {
    expect(totalsReconcile(null, null, 20792)).toBeNull();
    expect(totalsReconcile(18080, 2712, null)).toBeNull();
  });
});
