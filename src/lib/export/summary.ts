import ExcelJS from 'exceljs';
import { centsToInputValue, sumCents } from '@/lib/money';

export interface SummaryRow {
  date: string;
  time: string;
  merchant: string;
  receiptNumber: string;
  documentType: string;
  category: string;
  folder: string;
  paymentMethod: string;
  currency: string;
  subtotalCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
  tags: string;
  note: string;
  filename: string;
  status: string;
}

const HEADERS = [
  'Date',
  'Time',
  'Merchant',
  'Receipt number',
  'Document type',
  'Category',
  'Folder',
  'Payment method',
  'Currency',
  'Subtotal',
  'Tax / VAT',
  'Total',
  'Tags',
  'Note',
  'File',
  'Status',
];

/** RFC 4180 escaping, plus neutralising anything a spreadsheet would treat as a formula. */
function csvCell(value: string | number | null): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function buildCsv(rows: SummaryRow[]): Buffer {
  const lines = [HEADERS.map(csvCell).join(',')];

  for (const row of rows) {
    lines.push(
      [
        row.date,
        row.time,
        row.merchant,
        row.receiptNumber,
        row.documentType,
        row.category,
        row.folder,
        row.paymentMethod,
        row.currency,
        row.subtotalCents !== null ? centsToInputValue(row.subtotalCents, row.currency) : '',
        row.taxCents !== null ? centsToInputValue(row.taxCents, row.currency) : '',
        row.totalCents !== null ? centsToInputValue(row.totalCents, row.currency) : '',
        row.tags,
        row.note,
        row.filename,
        row.status,
      ]
        .map(csvCell)
        .join(','),
    );
  }

  const totals = sumCents(rows.map((row) => row.totalCents));
  const currency = rows[0]?.currency ?? 'ZAR';
  lines.push('');
  lines.push([csvCell(`Total (${rows.length} slips)`), '', '', '', '', '', '', '', '', '', '', csvCell(centsToInputValue(totals, currency))].join(','));

  // BOM so Excel opens UTF-8 correctly on Windows.
  return Buffer.from(`﻿${lines.join('\r\n')}\r\n`, 'utf8');
}

export async function buildXlsx(rows: SummaryRow[], businessName: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Slipsy';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Expenses', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Time', key: 'time', width: 8 },
    { header: 'Merchant', key: 'merchant', width: 28 },
    { header: 'Receipt number', key: 'receiptNumber', width: 18 },
    { header: 'Document type', key: 'documentType', width: 15 },
    { header: 'Category', key: 'category', width: 22 },
    { header: 'Folder', key: 'folder', width: 18 },
    { header: 'Payment method', key: 'paymentMethod', width: 16 },
    { header: 'Currency', key: 'currency', width: 10 },
    { header: 'Subtotal', key: 'subtotal', width: 13 },
    { header: 'Tax / VAT', key: 'tax', width: 13 },
    { header: 'Total', key: 'total', width: 13 },
    { header: 'Tags', key: 'tags', width: 20 },
    { header: 'Note', key: 'note', width: 30 },
    { header: 'File', key: 'filename', width: 42 },
    { header: 'Status', key: 'status', width: 14 },
  ];

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A2A1F' } };
  header.alignment = { vertical: 'middle' };
  header.height = 22;

  for (const row of rows) {
    sheet.addRow({
      date: row.date,
      time: row.time,
      merchant: row.merchant,
      receiptNumber: row.receiptNumber,
      documentType: row.documentType,
      category: row.category,
      folder: row.folder,
      paymentMethod: row.paymentMethod,
      currency: row.currency,
      subtotal: row.subtotalCents !== null ? Number(centsToInputValue(row.subtotalCents, row.currency)) : null,
      tax: row.taxCents !== null ? Number(centsToInputValue(row.taxCents, row.currency)) : null,
      total: row.totalCents !== null ? Number(centsToInputValue(row.totalCents, row.currency)) : null,
      tags: row.tags,
      note: row.note,
      filename: row.filename,
      status: row.status,
    });
  }

  const currencyFormat = '#,##0.00';
  ['J', 'K', 'L'].forEach((column) => {
    sheet.getColumn(column).numFmt = currencyFormat;
    sheet.getColumn(column).alignment = { horizontal: 'right' };
  });

  const totalRowNumber = rows.length + 3;
  const totalRow = sheet.getRow(totalRowNumber);
  totalRow.getCell('C').value = `${businessName} — ${rows.length} slip${rows.length === 1 ? '' : 's'}`;
  totalRow.getCell('K').value = 'Total';
  totalRow.getCell('L').value = rows.length
    ? { formula: `SUM(L2:L${rows.length + 1})`, result: Number(centsToInputValue(sumCents(rows.map((r) => r.totalCents)), rows[0]?.currency ?? 'ZAR')) }
    : 0;
  totalRow.font = { bold: true };
  totalRow.getCell('L').numFmt = currencyFormat;

  sheet.autoFilter = { from: 'A1', to: `P${Math.max(rows.length + 1, 1)}` };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
