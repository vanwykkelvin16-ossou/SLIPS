import { describe, expect, it } from 'vitest';
import { amountsInLine, parseDateCandidate, parseReceipt } from '@/lib/ocr/parse';
import type { OcrRawResult } from '@/lib/ocr/types';

const NOW = new Date('2026-09-18T12:00:00.000Z');

function raw(text: string, confidence = 0.92): OcrRawResult {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    provider: 'test',
    text: lines.join('\n'),
    lines: lines.map((line) => ({ text: line, confidence })),
    confidence,
  };
}

/** The fixture slip, as Tesseract actually reads it. */
const TILL_SLIP = `
FRESH MARKET TRADING
12 Long Street, Cape Town
VAT Reg No: 4230187654
Tel: 021 555 0143
TAX INVOICE
Invoice No: INV-2026-04417
Date: 14/09/2026 Time: 16:42
Brown bread 700g 18,99
Full cream milk 2L 34,50
Free range eggs 18s 64,95
Rooibos tea 80s 49,99
Dishwashing liquid 750ml 38,49
SUBTOTAL 180,80
VAT 15% 27,12
TOTAL 207,92
CARD PAYMENT VISA ****4192
CHANGE 0,00
Thank you for shopping with us
`;

describe('parseReceipt on a realistic South African till slip', () => {
  const parsed = parseReceipt(raw(TILL_SLIP), { now: NOW, defaultCurrency: 'ZAR' });

  it('finds the merchant', () => {
    expect(parsed.merchantName).toBe('Fresh Market Trading');
  });

  it('finds the totals', () => {
    expect(parsed.totalCents).toBe(20792);
    expect(parsed.subtotalCents).toBe(18080);
    expect(parsed.taxCents).toBe(2712);
  });

  it('reconciles subtotal plus tax against the total', () => {
    expect((parsed.subtotalCents ?? 0) + (parsed.taxCents ?? 0)).toBe(parsed.totalCents);
  });

  it('reads the date day-first, as South African slips are written', () => {
    expect(parsed.purchaseDate?.toISOString().slice(0, 10)).toBe('2026-09-14');
  });

  it('finds the time and the invoice number', () => {
    expect(parsed.purchaseTime).toBe('16:42');
    expect(parsed.receiptNumber).toBe('INV-2026-04417');
  });

  it('identifies the payment method', () => {
    expect(parsed.paymentMethod).toBe('CARD');
  });

  it('does not mistake the change line for the total', () => {
    expect(parsed.totalCents).not.toBe(0);
  });

  it('reports usable confidence for the fields it filled', () => {
    expect(parsed.confidence).toBeGreaterThan(0.5);
    expect(parsed.fieldConfidence.totalCents ?? 0).toBeGreaterThan(0.7);
  });
});

describe('parseReceipt edge cases', () => {
  it('returns empty suggestions for an empty document rather than throwing', () => {
    const parsed = parseReceipt(raw(''), { now: NOW });
    expect(parsed.merchantName).toBeNull();
    expect(parsed.totalCents).toBeNull();
    expect(parsed.confidence).toBe(0);
  });

  it('prefers the grand total over a subtotal', () => {
    const parsed = parseReceipt(
      raw(`CORNER CAFE
SUBTOTAL 100,00
VAT 15% 15,00
GRAND TOTAL 115,00`),
      { now: NOW },
    );
    expect(parsed.totalCents).toBe(11500);
    expect(parsed.subtotalCents).toBe(10000);
  });

  it('ignores "total items" style lines that are counts, not money', () => {
    const parsed = parseReceipt(
      raw(`QUICK SHOP
TOTAL ITEMS 7
TOTAL DUE 82,50`),
      { now: NOW },
    );
    expect(parsed.totalCents).toBe(8250);
  });

  it('derives the VAT split when only a rate and a total are printed', () => {
    const parsed = parseReceipt(
      raw(`FUEL STOP
Prices include VAT at 15%
TOTAL 230,00`),
      { now: NOW },
    );
    expect(parsed.totalCents).toBe(23000);
    expect((parsed.subtotalCents ?? 0) + (parsed.taxCents ?? 0)).toBe(23000);
    // A derived figure must be flagged as uncertain.
    expect(parsed.fieldConfidence.taxCents ?? 1).toBeLessThan(0.7);
  });

  it('refuses a date in the future', () => {
    const parsed = parseReceipt(raw(`SHOP\nDate: 14/09/2031\nTOTAL 10,00`), { now: NOW });
    expect(parsed.purchaseDate).toBeNull();
  });

  it('does not treat a VAT registration number as a tax amount', () => {
    const parsed = parseReceipt(raw(`STORE\nVAT Reg No: 4230187654\nTOTAL 55,00`), { now: NOW });
    expect(parsed.taxCents).not.toBe(423018765400);
  });

  it('falls back to the largest amount when no total keyword exists, flagged low', () => {
    const parsed = parseReceipt(raw(`MARKET STALL\nApples 12,00\nPears 30,00`), { now: NOW });
    expect(parsed.totalCents).toBe(3000);
    expect(parsed.fieldConfidence.totalCents ?? 1).toBeLessThan(0.7);
  });

  it('detects currency from the document', () => {
    expect(parseReceipt(raw(`SHOP\nTOTAL $45.00`), { now: NOW, defaultCurrency: 'ZAR' }).currency).toBe('USD');
    expect(parseReceipt(raw(`SHOP\nTOTAL R45,00`), { now: NOW, defaultCurrency: 'USD' }).currency).toBe('ZAR');
  });

  it('never returns tax larger than the total', () => {
    const parsed = parseReceipt(raw(`SHOP\nVAT 900,00\nTOTAL 50,00`), { now: NOW });
    expect(parsed.taxCents).toBeNull();
  });
});

describe('parseDateCandidate', () => {
  it('reads the common South African formats', () => {
    expect(parseDateCandidate('14/09/2026', NOW)?.toISOString().slice(0, 10)).toBe('2026-09-14');
    expect(parseDateCandidate('14-09-2026', NOW)?.toISOString().slice(0, 10)).toBe('2026-09-14');
    expect(parseDateCandidate('14.09.2026', NOW)?.toISOString().slice(0, 10)).toBe('2026-09-14');
    expect(parseDateCandidate('14/09/26', NOW)?.toISOString().slice(0, 10)).toBe('2026-09-14');
  });

  it('reads ISO and textual dates', () => {
    expect(parseDateCandidate('2026-09-14', NOW)?.toISOString().slice(0, 10)).toBe('2026-09-14');
    expect(parseDateCandidate('14 Sep 2026', NOW)?.toISOString().slice(0, 10)).toBe('2026-09-14');
    expect(parseDateCandidate('14 September 2026', NOW)?.toISOString().slice(0, 10)).toBe('2026-09-14');
    expect(parseDateCandidate('Sep 14, 2026', NOW)?.toISOString().slice(0, 10)).toBe('2026-09-14');
  });

  it('falls back to month-first when day-first is impossible', () => {
    // 08/25 cannot be day 8 of month 25, so it must be 25 August.
    expect(parseDateCandidate('08/25/2026', NOW)?.toISOString().slice(0, 10)).toBe('2026-08-25');
  });

  it('prefers day-first when both readings are possible', () => {
    // 05/09 is ambiguous; South African slips mean 5 September.
    expect(parseDateCandidate('05/09/2026', NOW)?.toISOString().slice(0, 10)).toBe('2026-09-05');
  });

  it('rejects impossible and out-of-range dates', () => {
    expect(parseDateCandidate('31/02/2026', NOW)).toBeNull();
    expect(parseDateCandidate('14/09/1985', NOW)).toBeNull();
    expect(parseDateCandidate('not a date', NOW)).toBeNull();
  });
});

describe('amountsInLine', () => {
  it('picks out money and ignores other numbers', () => {
    expect(amountsInLine('TOTAL 207,92', 'ZAR')).toEqual([20792]);
    expect(amountsInLine('Brown bread 700g 18,99', 'ZAR')).toEqual([1899]);
    expect(amountsInLine('SUBTOTAL 1 234,56', 'ZAR')).toEqual([123456]);
  });

  it('returns every amount on a line, in order', () => {
    expect(amountsInLine('2 x 15,00 30,00', 'ZAR')).toEqual([1500, 3000]);
  });

  it('returns nothing when there is no money on the line', () => {
    expect(amountsInLine('Thank you for shopping with us', 'ZAR')).toEqual([]);
  });
});
