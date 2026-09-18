import { describe, expect, it } from 'vitest';
import { archiveFolderPath, receiptFilename, safeSegment, uniquePath } from '@/lib/export/filenames';
import { financialYearLabel, financialYearRange } from '@/lib/folders';
import { buildCsv, type SummaryRow } from '@/lib/export/summary';

describe('receiptFilename', () => {
  it('produces the documented shape', () => {
    expect(
      receiptFilename({
        purchaseDate: new Date('2026-09-18T12:00:00Z'),
        createdAt: new Date('2026-09-20T12:00:00Z'),
        merchantName: 'MerchantName',
        totalCents: 24590,
        currency: 'ZAR',
        receiptNumber: 'ReceiptNumber',
        extension: 'pdf',
      }),
    ).toBe('2026-09-18_MerchantName_R245-90_ReceiptNumber.pdf');
  });

  it('falls back to the upload date when the slip has none', () => {
    expect(
      receiptFilename({
        purchaseDate: null,
        createdAt: new Date('2026-09-20T12:00:00Z'),
        merchantName: null,
        totalCents: null,
        currency: 'ZAR',
        receiptNumber: null,
        extension: 'jpg',
      }),
    ).toBe('2026-09-20_UnknownMerchant_no-total.jpg');
  });

  it('strips anything dangerous from a hostile merchant name', () => {
    const name = receiptFilename({
      purchaseDate: new Date('2026-09-18T12:00:00Z'),
      createdAt: new Date('2026-09-18T12:00:00Z'),
      merchantName: '../../etc/passwd; rm -rf /',
      totalCents: 100,
      currency: 'ZAR',
      receiptNumber: null,
      extension: 'pdf',
    });

    expect(name).not.toContain('/');
    expect(name).not.toContain('..');
    expect(name).not.toContain(';');
    expect(name.endsWith('.pdf')).toBe(true);
  });
});

describe('safeSegment', () => {
  it('removes path separators, spaces and punctuation', () => {
    expect(safeSegment('Pick n Pay')).toBe('PicknPay');
    expect(safeSegment('a/b\\c')).toBe('abc');
    expect(safeSegment('')).toBe('Unknown');
  });

  it('caps the length', () => {
    expect(safeSegment('x'.repeat(200)).length).toBeLessThanOrEqual(40);
  });
});

describe('archiveFolderPath', () => {
  it('files by the purchase year and month', () => {
    expect(archiveFolderPath(new Date('2026-09-18T12:00:00Z'), new Date('2026-01-01T00:00:00Z'))).toBe('2026/09-September');
    expect(archiveFolderPath(new Date('2026-01-05T12:00:00Z'), new Date('2026-01-01T00:00:00Z'))).toBe('2026/01-January');
  });

  it('falls back to the upload date', () => {
    expect(archiveFolderPath(null, new Date('2025-12-31T12:00:00Z'))).toBe('2025/12-December');
  });
});

describe('uniquePath', () => {
  it('keeps every archive entry distinct', () => {
    const used = new Set<string>();
    expect(uniquePath(used, '2026/09-September/slip.pdf')).toBe('2026/09-September/slip.pdf');
    expect(uniquePath(used, '2026/09-September/slip.pdf')).toBe('2026/09-September/slip-2.pdf');
    expect(uniquePath(used, '2026/09-September/slip.pdf')).toBe('2026/09-September/slip-3.pdf');
  });
});

describe('financial year', () => {
  it('labels a March-start year the South African way', () => {
    expect(financialYearLabel(new Date('2026-09-18T00:00:00Z'), 3)).toBe('FY2026/27');
    expect(financialYearLabel(new Date('2026-02-18T00:00:00Z'), 3)).toBe('FY2025/26');
  });

  it('labels a January-start year as a single year', () => {
    expect(financialYearLabel(new Date('2026-09-18T00:00:00Z'), 1)).toBe('FY2026');
  });

  it('gives the right range for a March start', () => {
    const { start, end } = financialYearRange(new Date('2026-09-18T00:00:00Z'), 3);
    expect(start.toISOString().slice(0, 10)).toBe('2026-03-01');
    expect(end.toISOString().slice(0, 10)).toBe('2027-02-28');
  });

  it('covers the day before the new year starts', () => {
    const { end } = financialYearRange(new Date('2026-05-01T00:00:00Z'), 3);
    const { start } = financialYearRange(new Date('2027-05-01T00:00:00Z'), 3);
    expect(end.getTime() + 1).toBe(start.getTime());
  });
});

describe('CSV summary', () => {
  const row: SummaryRow = {
    date: '2026-09-14',
    time: '16:42',
    merchant: 'Fresh Market Trading',
    receiptNumber: 'INV-2026-04417',
    documentType: 'Tax invoice',
    category: 'Groceries & Supplies',
    folder: 'September',
    paymentMethod: 'card',
    currency: 'ZAR',
    subtotalCents: 18080,
    taxCents: 2712,
    totalCents: 20792,
    tags: 'stock',
    note: 'Weekly stock run',
    filename: '2026/09-September/slip.png',
    status: 'Filed',
  };

  it('writes amounts as plain decimals a spreadsheet can total', () => {
    const csv = buildCsv([row]).toString('utf8');
    expect(csv).toContain('207.92');
    expect(csv).toContain('180.80');
    expect(csv).toContain('27.12');
  });

  it('quotes fields containing commas', () => {
    const csv = buildCsv([{ ...row, note: 'Milk, bread and eggs' }]).toString('utf8');
    expect(csv).toContain('"Milk, bread and eggs"');
  });

  it('neutralises formula injection', () => {
    const csv = buildCsv([{ ...row, merchant: '=cmd|/c calc' }]).toString('utf8');
    expect(csv).not.toMatch(/(^|,)=cmd/m);
    expect(csv).toContain("'=cmd");
  });

  it('starts with a byte order mark so Excel reads UTF-8', () => {
    expect(buildCsv([row]).toString('utf8').startsWith('﻿')).toBe(true);
  });

  it('ends with a total row', () => {
    const csv = buildCsv([row, row]).toString('utf8');
    expect(csv).toContain('Total (2 slips)');
    expect(csv).toContain('415.84');
  });
});
