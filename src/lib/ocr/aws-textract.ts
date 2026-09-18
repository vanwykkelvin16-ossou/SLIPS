import { getEnv } from '@/lib/env';
import type { OcrProvider, OcrRawResult, StructuredHints } from './types';

/**
 * AWS Textract `AnalyzeExpense` — a purpose-built receipt/invoice model that
 * returns labelled fields (vendor, total, tax, invoice number, line items)
 * rather than plain text.
 *
 * Requires AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_TEXTRACT_REGION.
 */
export class AwsTextractOcrProvider implements OcrProvider {
  readonly name = 'aws-textract';

  isConfigured(): boolean {
    const env = getEnv();
    return Boolean(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY && env.AWS_TEXTRACT_REGION);
  }

  async extract({ buffer }: { buffer: Buffer; mimeType: string }): Promise<OcrRawResult> {
    const env = getEnv();
    if (!this.isConfigured()) throw new Error('AWS Textract credentials are not configured');

    const { TextractClient, AnalyzeExpenseCommand } = await import('@aws-sdk/client-textract');
    const client = new TextractClient({
      region: env.AWS_TEXTRACT_REGION!,
      credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID!, secretAccessKey: env.AWS_SECRET_ACCESS_KEY! },
    });

    const result = await client.send(new AnalyzeExpenseCommand({ Document: { Bytes: new Uint8Array(buffer) } }));

    const lines: Array<{ text: string; confidence: number }> = [];
    const structured: StructuredHints = {};
    const confidences: number[] = [];

    const assign = (type: string | undefined, value: string | undefined, confidence: number | undefined) => {
      if (!type || !value) return;
      const score = clamp01((confidence ?? 80) / 100);
      switch (type) {
        case 'VENDOR_NAME':
        case 'NAME':
          structured.merchantName ??= { value, confidence: score };
          break;
        case 'INVOICE_RECEIPT_ID':
          structured.receiptNumber ??= { value, confidence: score };
          break;
        case 'INVOICE_RECEIPT_DATE':
          structured.purchaseDate ??= { value, confidence: score };
          break;
        case 'TOTAL':
        case 'AMOUNT_DUE':
          structured.total ??= { value, confidence: score };
          break;
        case 'SUBTOTAL':
          structured.subtotal ??= { value, confidence: score };
          break;
        case 'TAX':
          structured.tax ??= { value, confidence: score };
          break;
        default:
          break;
      }
    };

    for (const document of result.ExpenseDocuments ?? []) {
      for (const field of document.SummaryFields ?? []) {
        const type = field.Type?.Text;
        const value = field.ValueDetection?.Text?.trim();
        const confidence = field.ValueDetection?.Confidence;
        if (typeof confidence === 'number') confidences.push(confidence / 100);
        assign(type, value, confidence);
        if (type && value) lines.push({ text: `${field.LabelDetection?.Text ?? type}: ${value}`, confidence: clamp01((confidence ?? 80) / 100) });
      }

      const items: NonNullable<StructuredHints['lineItems']> = [];
      for (const group of document.LineItemGroups ?? []) {
        for (const item of group.LineItems ?? []) {
          const entry: { description?: string; quantity?: string; unitPrice?: string; total?: string; confidence: number } = {
            confidence: 0.8,
          };
          for (const field of item.LineItemExpenseFields ?? []) {
            const type = field.Type?.Text;
            const value = field.ValueDetection?.Text?.trim();
            if (!type || !value) continue;
            if (type === 'ITEM') entry.description = value;
            if (type === 'QUANTITY') entry.quantity = value;
            if (type === 'UNIT_PRICE' || type === 'PRICE') entry.unitPrice = value;
            if (type === 'EXPENSE_ROW' && !entry.description) entry.description = value;
            if (type === 'TOTAL') entry.total = value;
            if (typeof field.ValueDetection?.Confidence === 'number') {
              entry.confidence = clamp01(field.ValueDetection.Confidence / 100);
            }
          }
          if (entry.description) items.push({ ...entry, description: entry.description });
        }
      }
      if (items.length) structured.lineItems = items;
    }

    const text = lines.map((line) => line.text).join('\n');
    const confidence = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : text ? 0.85 : 0;

    return { provider: this.name, text, lines, confidence, structured };
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
