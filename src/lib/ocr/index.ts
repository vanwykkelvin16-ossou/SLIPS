import { getEnv } from '@/lib/env';
import { AwsTextractOcrProvider } from './aws-textract';
import { AzureDocumentOcrProvider } from './azure-document-intelligence';
import { GoogleVisionOcrProvider } from './google-vision';
import { parseReceipt, type ParseOptions } from './parse';
import { TesseractOcrProvider } from './tesseract';
import type { OcrProvider, OcrRawResult, ParsedReceipt } from './types';

export { parseReceipt } from './parse';
export { LOW_CONFIDENCE_THRESHOLD } from './types';
export type { OcrProvider, OcrRawResult, ParsedReceipt, ParsedField, ConfidenceMap } from './types';

let provider: OcrProvider | null = null;

export function getOcrProvider(): OcrProvider {
  if (provider) return provider;
  const env = getEnv();

  const configured: OcrProvider =
    env.OCR_PROVIDER === 'google-vision'
      ? new GoogleVisionOcrProvider()
      : env.OCR_PROVIDER === 'aws-textract'
        ? new AwsTextractOcrProvider()
        : env.OCR_PROVIDER === 'azure-document-intelligence'
          ? new AzureDocumentOcrProvider()
          : new TesseractOcrProvider();

  // A cloud provider selected without credentials falls back to the built-in
  // engine rather than failing every upload.
  provider = configured.isConfigured() ? configured : new TesseractOcrProvider();
  return provider;
}

/** Test seam. */
export function setOcrProvider(next: OcrProvider | null) {
  provider = next;
}

export interface OcrOutcome {
  raw: OcrRawResult;
  parsed: ParsedReceipt;
}

/**
 * Runs the configured provider and converts its output into suggested fields.
 * Never throws: a failed or empty extraction returns an empty suggestion set so
 * the document is still stored and the user can fill the details in by hand.
 */
export async function runOcr(
  input: { buffer: Buffer; mimeType: string },
  options: ParseOptions = {},
): Promise<OcrOutcome> {
  const active = getOcrProvider();
  const raw = await active.extract(input);
  const parsed = parseReceipt(raw, options);
  return { raw, parsed };
}
