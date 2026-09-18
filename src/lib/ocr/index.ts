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

/** A provider that never answers must not hold the request open forever. */
const OCR_TIMEOUT_MS = Number(process.env.OCR_TIMEOUT_MS ?? 90_000);

export class OcrTimeoutError extends Error {
  constructor() {
    super('Reading the document took too long.');
    this.name = 'OcrTimeoutError';
  }
}

/**
 * Runs the configured provider and converts its output into suggested fields.
 * The caller stores the document regardless, so a failure here only means the
 * user fills the details in by hand.
 */
export async function runOcr(
  input: { buffer: Buffer; mimeType: string },
  options: ParseOptions = {},
): Promise<OcrOutcome> {
  const active = getOcrProvider();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new OcrTimeoutError()), OCR_TIMEOUT_MS);
  });

  try {
    const raw = await Promise.race([active.extract(input), timeout]);
    const parsed = parseReceipt(raw, options);
    return { raw, parsed };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
