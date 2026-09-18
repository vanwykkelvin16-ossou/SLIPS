import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { brand } from '@/config/brand';
import { formatMoney } from '@/lib/money';
import sharp from 'sharp';

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;

const FOREST = rgb(0.04, 0.24, 0.16);
const CHARCOAL = rgb(0.12, 0.16, 0.14);
const MUTED = rgb(0.42, 0.48, 0.45);
const LINE = rgb(0.89, 0.91, 0.9);
const MINT = rgb(0.85, 0.96, 0.9);

export interface ReceiptPdfInput {
  businessName: string;
  merchantName: string | null;
  receiptNumber: string | null;
  purchaseDate: Date | null;
  purchaseTime: string | null;
  currency: string;
  subtotalCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
  paymentMethod: string;
  documentType: string;
  categoryName: string | null;
  folderName: string | null;
  note: string | null;
  tags: string[];
  lineItems: Array<{ description: string; quantity: string | null; unitCents: number | null; totalCents: number | null }>;
  uploadedAt: Date;
  updatedAt: Date;
  /** Original pages, in order. Images are placed; PDFs have their pages copied. */
  pages: Array<{ buffer: Buffer; mimeType: string }>;
}

/**
 * Builds a self-contained PDF for one slip: the extracted details on the first
 * page, then the original document exactly as it was captured.
 */
export async function buildReceiptPdf(input: ReceiptPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${input.merchantName ?? 'Slip'}${input.receiptNumber ? ` — ${input.receiptNumber}` : ''}`);
  pdf.setProducer(brand.name);
  pdf.setCreator(brand.name);
  pdf.setCreationDate(new Date());

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const page = pdf.addPage([A4.width, A4.height]);
  let cursor = A4.height - MARGIN;

  // Header band
  page.drawRectangle({ x: 0, y: A4.height - 92, width: A4.width, height: 92, color: FOREST });
  page.drawText(brand.name, { x: MARGIN, y: A4.height - 50, size: 20, font: bold, color: rgb(1, 1, 1) });
  page.drawText(input.businessName.slice(0, 60), {
    x: MARGIN,
    y: A4.height - 70,
    size: 10,
    font: regular,
    color: rgb(0.72, 0.89, 0.81),
  });
  const docLabel = input.documentType === 'TAX_INVOICE' ? 'Tax invoice' : input.documentType === 'OTHER' ? 'Expense document' : 'Receipt';
  page.drawText(docLabel.toUpperCase(), {
    x: A4.width - MARGIN - bold.widthOfTextAtSize(docLabel.toUpperCase(), 10),
    y: A4.height - 50,
    size: 10,
    font: bold,
    color: rgb(0.72, 0.89, 0.81),
  });

  cursor = A4.height - 128;

  const merchant = input.merchantName ?? 'Unknown merchant';
  page.drawText(truncate(merchant, 42), { x: MARGIN, y: cursor, size: 22, font: bold, color: FOREST });
  cursor -= 26;

  const dateLabel = input.purchaseDate ? formatDate(input.purchaseDate) : 'Date not recorded';
  page.drawText(`${dateLabel}${input.purchaseTime ? ` at ${input.purchaseTime}` : ''}`, {
    x: MARGIN,
    y: cursor,
    size: 11,
    font: regular,
    color: MUTED,
  });
  cursor -= 30;

  // Total highlight
  page.drawRectangle({ x: MARGIN, y: cursor - 44, width: A4.width - MARGIN * 2, height: 52, color: MINT });
  page.drawText('Total', { x: MARGIN + 16, y: cursor - 14, size: 10, font: bold, color: FOREST });
  const totalText = formatMoneyPlain(input.totalCents, input.currency);
  page.drawText(totalText, {
    x: A4.width - MARGIN - 16 - bold.widthOfTextAtSize(totalText, 20),
    y: cursor - 22,
    size: 20,
    font: bold,
    color: FOREST,
  });
  cursor -= 72;

  const rows: Array<[string, string]> = [
    ['Receipt number', input.receiptNumber ?? '—'],
    ['Category', input.categoryName ?? 'Uncategorised'],
    ['Folder', input.folderName ?? 'Unfiled'],
    ['Payment method', prettyPayment(input.paymentMethod)],
    ['Subtotal', formatMoneyPlain(input.subtotalCents, input.currency)],
    ['Tax / VAT', formatMoneyPlain(input.taxCents, input.currency)],
    ['Currency', input.currency],
    ['Tags', input.tags.length ? input.tags.join(', ') : '—'],
  ];

  cursor = drawTable(page, rows, cursor, regular, bold);

  if (input.note) {
    cursor -= 14;
    page.drawText('Note', { x: MARGIN, y: cursor, size: 10, font: bold, color: FOREST });
    cursor -= 14;
    cursor = drawWrapped(page, input.note, MARGIN, cursor, A4.width - MARGIN * 2, 10, regular, CHARCOAL);
  }

  if (input.lineItems.length) {
    cursor -= 20;
    page.drawText('Items', { x: MARGIN, y: cursor, size: 10, font: bold, color: FOREST });
    cursor -= 16;
    for (const item of input.lineItems.slice(0, 22)) {
      if (cursor < MARGIN + 80) break;
      const label = `${item.quantity ? `${item.quantity} × ` : ''}${truncate(item.description, 52)}`;
      page.drawText(label, { x: MARGIN, y: cursor, size: 9.5, font: regular, color: CHARCOAL });
      const amount = formatMoneyPlain(item.totalCents, input.currency);
      page.drawText(amount, {
        x: A4.width - MARGIN - regular.widthOfTextAtSize(amount, 9.5),
        y: cursor,
        size: 9.5,
        font: regular,
        color: CHARCOAL,
      });
      cursor -= 14;
    }
  }

  // Footer
  const footer = `Filed with ${brand.name} · uploaded ${formatDate(input.uploadedAt)} · last changed ${formatDate(input.updatedAt)}`;
  page.drawLine({
    start: { x: MARGIN, y: MARGIN + 22 },
    end: { x: A4.width - MARGIN, y: MARGIN + 22 },
    thickness: 0.7,
    color: LINE,
  });
  page.drawText(footer, { x: MARGIN, y: MARGIN + 8, size: 8, font: regular, color: MUTED });

  await appendOriginals(pdf, input.pages, regular, bold);

  return pdf.save();
}

async function appendOriginals(
  pdf: PDFDocument,
  pages: ReceiptPdfInput['pages'],
  regular: PDFFont,
  bold: PDFFont,
): Promise<void> {
  for (const source of pages) {
    if (source.mimeType === 'application/pdf') {
      try {
        const original = await PDFDocument.load(source.buffer, { ignoreEncryption: true });
        const copied = await pdf.copyPages(original, original.getPageIndices());
        copied.forEach((copiedPage) => pdf.addPage(copiedPage));
      } catch {
        drawUnavailablePage(pdf, regular, bold, 'The original PDF could not be embedded, but it is stored safely.');
      }
      continue;
    }

    try {
      // pdf-lib embeds JPEG and PNG only; everything else is converted first.
      const jpeg =
        source.mimeType === 'image/jpeg'
          ? source.buffer
          : await sharp(source.buffer, { failOn: 'none' }).rotate().jpeg({ quality: 82 }).toBuffer();

      const image = await pdf.embedJpg(jpeg);
      const page = pdf.addPage([A4.width, A4.height]);
      const maxWidth = A4.width - MARGIN * 2;
      const maxHeight = A4.height - MARGIN * 2;
      const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
      const width = image.width * scale;
      const height = image.height * scale;

      page.drawImage(image, {
        x: (A4.width - width) / 2,
        y: (A4.height - height) / 2,
        width,
        height,
      });
    } catch {
      drawUnavailablePage(pdf, regular, bold, 'This page could not be rendered, but the original file is stored safely.');
    }
  }
}

function drawUnavailablePage(pdf: PDFDocument, regular: PDFFont, bold: PDFFont, message: string) {
  const page = pdf.addPage([A4.width, A4.height]);
  page.drawText('Original document', { x: MARGIN, y: A4.height / 2 + 12, size: 14, font: bold, color: FOREST });
  page.drawText(message, { x: MARGIN, y: A4.height / 2 - 10, size: 10, font: regular, color: MUTED });
}

function drawTable(page: PDFPage, rows: Array<[string, string]>, startY: number, regular: PDFFont, bold: PDFFont): number {
  let y = startY;
  for (const [label, value] of rows) {
    page.drawText(label, { x: MARGIN, y, size: 10, font: regular, color: MUTED });
    page.drawText(truncate(value, 46), { x: MARGIN + 150, y, size: 10, font: bold, color: CHARCOAL });
    y -= 12;
    page.drawLine({
      start: { x: MARGIN, y: y + 4 },
      end: { x: A4.width - MARGIN, y: y + 4 },
      thickness: 0.5,
      color: LINE,
    });
    y -= 10;
  }
  return y;
}

function drawWrapped(
  page: PDFPage,
  text: string,
  x: number,
  startY: number,
  maxWidth: number,
  size: number,
  font: PDFFont,
  color: ReturnType<typeof rgb>,
): number {
  const words = text.split(/\s+/);
  let line = '';
  let y = startY;

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      page.drawText(line, { x, y, size, font, color });
      y -= size + 4;
      line = word;
      if (y < MARGIN + 40) break;
    } else {
      line = candidate;
    }
  }
  if (line && y >= MARGIN + 40) {
    page.drawText(line, { x, y, size, font, color });
    y -= size + 4;
  }
  return y;
}

function truncate(value: string, max: number): string {
  const clean = value.replace(/[\r\n\t]+/g, ' ').trim();
  // WinAnsi has no glyph for most non-latin characters; drop what cannot be drawn.
  const safe = clean.replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
  return safe.length > max ? `${safe.slice(0, max - 1)}…`.replace('…', '...') : safe;
}

function formatMoneyPlain(cents: number | null, currency: string): string {
  if (cents === null) return '—'.replace('—', '-');
  return formatMoney(cents, currency).replace(/ /g, ' ');
}

function prettyPayment(method: string): string {
  switch (method) {
    case 'CARD':
      return 'Card';
    case 'CASH':
      return 'Cash';
    case 'EFT':
      return 'EFT';
    case 'DEBIT_ORDER':
      return 'Debit order';
    case 'MOBILE':
      return 'Mobile payment';
    case 'OTHER':
      return 'Other';
    default:
      return 'Not recorded';
  }
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}
