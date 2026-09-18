import { centsToInputValue } from '@/lib/money';

/**
 * Shapes shared by the server pages that render the receipt form and the
 * client component that owns it.
 *
 * This deliberately lives outside the `'use client'` module: exports of a
 * client module become client references, so a server component cannot call
 * a plain function defined there.
 */

export interface FolderOption {
  id: string;
  label: string;
}

export interface CategoryOption {
  id: string;
  name: string;
}

export interface DuplicateWarning {
  receiptId: string;
  merchantName: string | null;
  purchaseDate: string | null;
  totalCents: number | null;
  currency: string;
  score: number;
  explanation: string;
}

export interface ReceiptFormValues {
  merchantName: string;
  receiptNumber: string;
  purchaseDate: string;
  purchaseTime: string;
  documentType: 'RECEIPT' | 'TAX_INVOICE' | 'OTHER';
  currency: string;
  subtotal: string;
  tax: string;
  total: string;
  paymentMethod: string;
  categoryId: string;
  folderId: string;
  note: string;
  tags: string[];
}

export interface ReceiptFormSource {
  merchantName: string | null;
  receiptNumber: string | null;
  purchaseDate: string | Date | null;
  purchaseTime: string | null;
  documentType: string;
  currency: string;
  subtotalCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
  paymentMethod: string;
  categoryId: string | null;
  folderId: string | null;
  note: string | null;
  tags: string[];
}

/** Converts a stored receipt into the string values the form edits. */
export function toFormValues(receipt: ReceiptFormSource): ReceiptFormValues {
  const date = receipt.purchaseDate
    ? typeof receipt.purchaseDate === 'string'
      ? receipt.purchaseDate.slice(0, 10)
      : receipt.purchaseDate.toISOString().slice(0, 10)
    : '';

  return {
    merchantName: receipt.merchantName ?? '',
    receiptNumber: receipt.receiptNumber ?? '',
    purchaseDate: date,
    purchaseTime: receipt.purchaseTime ?? '',
    documentType: (receipt.documentType as ReceiptFormValues['documentType']) ?? 'RECEIPT',
    currency: receipt.currency,
    subtotal: receipt.subtotalCents !== null ? centsToInputValue(receipt.subtotalCents, receipt.currency) : '',
    tax: receipt.taxCents !== null ? centsToInputValue(receipt.taxCents, receipt.currency) : '',
    total: receipt.totalCents !== null ? centsToInputValue(receipt.totalCents, receipt.currency) : '',
    paymentMethod: receipt.paymentMethod ?? 'UNKNOWN',
    categoryId: receipt.categoryId ?? '',
    folderId: receipt.folderId ?? '',
    note: receipt.note ?? '',
    tags: receipt.tags,
  };
}
