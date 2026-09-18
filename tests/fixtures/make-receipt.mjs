/**
 * Renders a realistic till slip as a PNG, used by the end-to-end tests so the
 * OCR pipeline is exercised against real image input rather than a stub.
 *
 *   node tests/fixtures/make-receipt.mjs [outputPath]
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const lines = [
  { text: 'FRESH MARKET TRADING', size: 30, weight: 700, gap: 40 },
  { text: '12 Long Street, Cape Town', size: 17, gap: 24 },
  { text: 'VAT Reg No: 4230187654', size: 17, gap: 24 },
  { text: 'Tel: 021 555 0143', size: 17, gap: 34 },
  { text: '--------------------------------', size: 18, gap: 30 },
  { text: 'TAX INVOICE', size: 22, weight: 700, gap: 34 },
  { text: 'Invoice No: INV-2026-04417', size: 18, gap: 26 },
  { text: 'Date: 14/09/2026    Time: 16:42', size: 18, gap: 34 },
  { text: '--------------------------------', size: 18, gap: 30 },
  { text: 'Brown bread 700g            18,99', size: 18, gap: 26 },
  { text: 'Full cream milk 2L          34,50', size: 18, gap: 26 },
  { text: 'Free range eggs 18s         64,95', size: 18, gap: 26 },
  { text: 'Rooibos tea 80s             49,99', size: 18, gap: 26 },
  { text: 'Dishwashing liquid 750ml    38,49', size: 18, gap: 34 },
  { text: '--------------------------------', size: 18, gap: 30 },
  { text: 'SUBTOTAL                   180,80', size: 19, gap: 26 },
  { text: 'VAT 15%                     27,12', size: 19, gap: 30 },
  { text: 'TOTAL                      207,92', size: 24, weight: 700, gap: 34 },
  { text: '--------------------------------', size: 18, gap: 30 },
  { text: 'CARD PAYMENT       VISA ****4192', size: 18, gap: 26 },
  { text: 'CHANGE                       0,00', size: 18, gap: 34 },
  { text: 'Thank you for shopping with us', size: 17, gap: 24 },
];

function escapeXml(value) {
  return value.replace(/[&<>"']/g, (char) =>
    char === '&' ? '&amp;' : char === '<' ? '&lt;' : char === '>' ? '&gt;' : char === '"' ? '&quot;' : '&apos;',
  );
}

export function receiptSvg() {
  const width = 520;
  let y = 56;
  const body = lines
    .map((line) => {
      const element = `<text x="40" y="${y}" font-family="DejaVu Sans Mono, Courier New, monospace" font-size="${line.size}" font-weight="${line.weight ?? 400}" fill="#141414" xml:space="preserve">${escapeXml(line.text)}</text>`;
      y += line.gap;
      return element;
    })
    .join('\n  ');

  const height = y + 30;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#FDFDFB"/>
  ${body}
</svg>`;
}

const output = process.argv[2] ?? path.join(process.cwd(), 'tests', 'fixtures', 'receipt.png');

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, await sharp(Buffer.from(receiptSvg())).png().toBuffer());
console.log(`Wrote ${output}`);
