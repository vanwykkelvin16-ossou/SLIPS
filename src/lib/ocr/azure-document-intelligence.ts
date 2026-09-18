import { getEnv } from '@/lib/env';
import type { OcrProvider, OcrRawResult, StructuredHints } from './types';

interface AzureField {
  content?: string;
  confidence?: number;
  valueString?: string;
  valueDate?: string;
  valueTime?: string;
  valueNumber?: number;
  valueCurrency?: { amount?: number; currencyCode?: string };
  valueArray?: Array<{ valueObject?: Record<string, AzureField>; confidence?: number }>;
}

interface AzureAnalyzeResult {
  status?: string;
  error?: { message?: string };
  analyzeResult?: {
    content?: string;
    pages?: Array<{ lines?: Array<{ content?: string }> }>;
    documents?: Array<{ confidence?: number; fields?: Record<string, AzureField> }>;
  };
}

/**
 * Azure AI Document Intelligence, `prebuilt-receipt` model.
 * Requires AZURE_DOCUMENT_ENDPOINT and AZURE_DOCUMENT_KEY.
 */
export class AzureDocumentOcrProvider implements OcrProvider {
  readonly name = 'azure-document-intelligence';

  isConfigured(): boolean {
    const env = getEnv();
    return Boolean(env.AZURE_DOCUMENT_ENDPOINT && env.AZURE_DOCUMENT_KEY);
  }

  async extract({ buffer, mimeType }: { buffer: Buffer; mimeType: string }): Promise<OcrRawResult> {
    const env = getEnv();
    if (!this.isConfigured()) throw new Error('Azure Document Intelligence is not configured');

    const endpoint = env.AZURE_DOCUMENT_ENDPOINT!.replace(/\/$/, '');
    const submitUrl = `${endpoint}/documentintelligence/documentModels/prebuilt-receipt:analyze?api-version=2024-02-29-preview`;

    const submit = await fetch(submitUrl, {
      method: 'POST',
      headers: { 'Content-Type': mimeType, 'Ocp-Apim-Subscription-Key': env.AZURE_DOCUMENT_KEY! },
      body: new Uint8Array(buffer),
    });

    if (submit.status !== 202) {
      throw new Error(`Azure Document Intelligence submit failed with status ${submit.status}`);
    }

    const operationUrl = submit.headers.get('operation-location');
    if (!operationUrl) throw new Error('Azure Document Intelligence did not return an operation location');

    const deadline = Date.now() + 60_000;
    let payload: AzureAnalyzeResult | null = null;

    while (Date.now() < deadline) {
      await sleep(1500);
      const poll = await fetch(operationUrl, { headers: { 'Ocp-Apim-Subscription-Key': env.AZURE_DOCUMENT_KEY! } });
      if (!poll.ok) throw new Error(`Azure Document Intelligence poll failed with status ${poll.status}`);
      payload = (await poll.json()) as AzureAnalyzeResult;
      if (payload.status === 'succeeded') break;
      if (payload.status === 'failed') throw new Error(payload.error?.message ?? 'Azure analysis failed');
    }

    if (!payload || payload.status !== 'succeeded') throw new Error('Azure Document Intelligence timed out');

    const document = payload.analyzeResult?.documents?.[0];
    const fields = document?.fields ?? {};
    const structured: StructuredHints = {};

    const merchant = fields.MerchantName;
    if (merchant?.valueString ?? merchant?.content) {
      structured.merchantName = { value: (merchant.valueString ?? merchant.content)!, confidence: merchant.confidence ?? 0.8 };
    }
    if (fields.TransactionDate?.valueDate) {
      structured.purchaseDate = { value: fields.TransactionDate.valueDate, confidence: fields.TransactionDate.confidence ?? 0.8 };
    }
    if (fields.TransactionTime?.valueTime) {
      structured.purchaseTime = { value: fields.TransactionTime.valueTime.slice(0, 5), confidence: fields.TransactionTime.confidence ?? 0.8 };
    }
    if (fields.ReceiptNumber?.content) {
      structured.receiptNumber = { value: fields.ReceiptNumber.content, confidence: fields.ReceiptNumber.confidence ?? 0.75 };
    }

    const money = (field: AzureField | undefined) =>
      field?.valueCurrency?.amount !== undefined ? String(field.valueCurrency.amount) : field?.content;

    if (money(fields.Total)) structured.total = { value: money(fields.Total)!, confidence: fields.Total?.confidence ?? 0.85 };
    if (money(fields.Subtotal)) structured.subtotal = { value: money(fields.Subtotal)!, confidence: fields.Subtotal?.confidence ?? 0.8 };
    if (money(fields.TotalTax)) structured.tax = { value: money(fields.TotalTax)!, confidence: fields.TotalTax?.confidence ?? 0.8 };
    const currencyCode = fields.Total?.valueCurrency?.currencyCode;
    if (currencyCode) structured.currency = { value: currencyCode, confidence: 0.9 };
    if (fields.PaymentMethod?.content) {
      structured.paymentMethod = { value: fields.PaymentMethod.content, confidence: fields.PaymentMethod.confidence ?? 0.7 };
    }

    const items = fields.Items?.valueArray ?? [];
    const lineItems = items
      .map((item) => {
        const object = item.valueObject ?? {};
        const description = object.Description?.valueString ?? object.Description?.content;
        if (!description) return null;
        return {
          description,
          quantity: object.Quantity?.valueNumber !== undefined ? String(object.Quantity.valueNumber) : undefined,
          unitPrice: money(object.Price),
          total: money(object.TotalPrice),
          confidence: item.confidence ?? 0.8,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
    if (lineItems.length) structured.lineItems = lineItems;

    const text = payload.analyzeResult?.content ?? '';
    const lines = (payload.analyzeResult?.pages ?? [])
      .flatMap((page) => page.lines ?? [])
      .map((line) => ({ text: (line.content ?? '').trim(), confidence: document?.confidence ?? 0.85 }))
      .filter((line) => line.text.length > 0);

    return { provider: this.name, text, lines, confidence: document?.confidence ?? (text ? 0.85 : 0), structured };
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
