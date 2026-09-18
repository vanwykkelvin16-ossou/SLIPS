import { formatMoneyForFilename } from '@/lib/money';

/** Strips anything that could break a filesystem, a ZIP entry or a shell. */
export function safeSegment(value: string, max = 40): string {
  const cleaned = value
    .normalize('NFKD')
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, '')
    .replace(/[-_.]{2,}/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '');
  return cleaned.slice(0, max) || 'Unknown';
}

export interface ReceiptFilenameParts {
  purchaseDate: Date | null;
  createdAt: Date;
  merchantName: string | null;
  totalCents: number | null;
  currency: string;
  receiptNumber: string | null;
  extension: string;
}

/**
 * Builds the human-sortable filename used in downloads and exports, e.g.
 * `2026-09-18_MerchantName_R245-90_INV12345.pdf`.
 */
export function receiptFilename(parts: ReceiptFilenameParts): string {
  const date = (parts.purchaseDate ?? parts.createdAt).toISOString().slice(0, 10);
  const merchant = safeSegment(parts.merchantName ?? 'UnknownMerchant');
  const amount = safeSegment(formatMoneyForFilename(parts.totalCents, parts.currency), 20);
  const number = parts.receiptNumber ? `_${safeSegment(parts.receiptNumber, 24)}` : '';
  const extension = parts.extension.replace(/^\./, '').toLowerCase();
  return `${date}_${merchant}_${amount}${number}.${extension}`;
}

const MONTH_FOLDER = [
  '01-January', '02-February', '03-March', '04-April', '05-May', '06-June',
  '07-July', '08-August', '09-September', '10-October', '11-November', '12-December',
];

/** Year/month path used inside export archives. */
export function archiveFolderPath(purchaseDate: Date | null, createdAt: Date): string {
  const date = purchaseDate ?? createdAt;
  const year = date.getUTCFullYear();
  const month = MONTH_FOLDER[date.getUTCMonth()] ?? '01-January';
  return `${year}/${month}`;
}

export function exportArchiveName(label: string | null, type: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const base = label ? safeSegment(label, 40) : safeSegment(type.toLowerCase().replace(/_/g, '-'), 24);
  return `slipsy-${base}-${stamp}.zip`;
}

/** Ensures every entry in an archive has a distinct path. */
export function uniquePath(used: Set<string>, path: string): string {
  if (!used.has(path)) {
    used.add(path);
    return path;
  }
  const dot = path.lastIndexOf('.');
  const stem = dot === -1 ? path : path.slice(0, dot);
  const extension = dot === -1 ? '' : path.slice(dot);
  let counter = 2;
  let candidate = `${stem}-${counter}${extension}`;
  while (used.has(candidate)) {
    counter += 1;
    candidate = `${stem}-${counter}${extension}`;
  }
  used.add(candidate);
  return candidate;
}
