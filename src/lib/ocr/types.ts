import type { PaymentMethod } from '@prisma/client';

export interface OcrWord {
  text: string;
  confidence: number;
  line: number;
}

export interface OcrLine {
  text: string;
  confidence: number;
}

/** Raw output of a document-understanding provider. */
export interface OcrRawResult {
  provider: string;
  text: string;
  lines: OcrLine[];
  /** Mean confidence across the document, 0-1. */
  confidence: number;
  /**
   * Structured fields a document-understanding provider extracted directly
   * (AWS Textract AnalyzeExpense, Azure Document Intelligence prebuilt-receipt).
   * Text-only engines such as Tesseract leave this undefined and the shared
   * parser derives the fields from the text instead.
   */
  structured?: StructuredHints;
}

export interface StructuredHints {
  merchantName?: { value: string; confidence: number };
  receiptNumber?: { value: string; confidence: number };
  purchaseDate?: { value: string; confidence: number };
  purchaseTime?: { value: string; confidence: number };
  currency?: { value: string; confidence: number };
  subtotal?: { value: string; confidence: number };
  tax?: { value: string; confidence: number };
  total?: { value: string; confidence: number };
  paymentMethod?: { value: string; confidence: number };
  lineItems?: Array<{ description: string; quantity?: string; unitPrice?: string; total?: string; confidence: number }>;
}

export interface ParsedLineItem {
  description: string;
  quantity: number | null;
  unitCents: number | null;
  totalCents: number | null;
}

export type ConfidenceMap = Partial<Record<ParsedField, number>>;

export type ParsedField =
  | 'merchantName'
  | 'receiptNumber'
  | 'purchaseDate'
  | 'purchaseTime'
  | 'currency'
  | 'subtotalCents'
  | 'taxCents'
  | 'totalCents'
  | 'paymentMethod'
  | 'lineItems';

export interface ParsedReceipt {
  merchantName: string | null;
  receiptNumber: string | null;
  purchaseDate: Date | null;
  purchaseTime: string | null;
  currency: string;
  subtotalCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
  paymentMethod: PaymentMethod;
  lineItems: ParsedLineItem[];
  fieldConfidence: ConfidenceMap;
  /** Overall confidence, 0-1. */
  confidence: number;
}

export interface OcrProvider {
  readonly name: string;
  /** True when credentials/runtime requirements are satisfied. */
  isConfigured(): boolean;
  extract(input: { buffer: Buffer; mimeType: string }): Promise<OcrRawResult>;
}

/** Fields below this confidence are flagged for the user to check. */
export const LOW_CONFIDENCE_THRESHOLD = 0.7;
