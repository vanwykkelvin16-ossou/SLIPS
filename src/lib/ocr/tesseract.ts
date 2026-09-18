import { existsSync } from 'node:fs';
import path from 'node:path';
import { enhanceForOcr } from '@/lib/images';
import { extractPdfText } from './pdf-text';
import type { OcrProvider, OcrRawResult } from './types';

/**
 * Default OCR engine: Tesseract, running inside the Node process.
 *
 * It needs no credentials and no third-party service, which keeps documents on
 * your own infrastructure. Images are OCR'd directly; PDFs use their embedded
 * text layer. Scanned PDFs have neither, so they are returned empty and the
 * user completes the details by hand (or a cloud provider is configured).
 */
export class TesseractOcrProvider implements OcrProvider {
  readonly name = 'tesseract';

  isConfigured(): boolean {
    return true;
  }

  async extract({ buffer, mimeType }: { buffer: Buffer; mimeType: string }): Promise<OcrRawResult> {
    if (mimeType === 'application/pdf') {
      const pdf = await extractPdfText(buffer);
      if (!pdf) {
        return { provider: this.name, text: '', lines: [], confidence: 0 };
      }
      return {
        provider: `${this.name}:pdf-text-layer`,
        text: pdf.text,
        lines: pdf.lines.map((text) => ({ text, confidence: 0.97 })),
        confidence: 0.97,
      };
    }

    const prepared = await enhanceForOcr(buffer);
    const { createWorker } = await import('tesseract.js');

    const langPath = resolveLanguagePath();
    const worker = await createWorker('eng', 1, {
      // Reading the language data from disk keeps extraction working on hosts
      // with no outbound internet access. Without it Tesseract fetches ~3 MB
      // from a public CDN on first use.
      ...(langPath ? { langPath } : {}),
      cachePath: process.env.OCR_CACHE_PATH || './.tesseract-cache',
      gzip: true,
      logger: () => undefined,
    });

    try {
      const { data } = await worker.recognize(prepared);
      const lines = (data.lines ?? [])
        .map((line) => ({ text: line.text.replace(/\s+/g, ' ').trim(), confidence: clamp01((line.confidence ?? 0) / 100) }))
        .filter((line) => line.text.length > 0);

      return {
        provider: this.name,
        text: data.text ?? '',
        lines,
        confidence: clamp01((data.confidence ?? 0) / 100),
      };
    } finally {
      await worker.terminate();
    }
  }
}

let cachedLangPath: string | null | undefined;

/**
 * Finds the bundled `eng.traineddata.gz`. OCR_LANG_PATH wins when set;
 * otherwise the copy installed with @tesseract.js-data/eng is used. Returning
 * null lets Tesseract fall back to its CDN, which only works online.
 */
function resolveLanguagePath(): string | null {
  if (cachedLangPath !== undefined) return cachedLangPath;

  const candidates = [
    process.env.OCR_LANG_PATH,
    path.join(process.cwd(), 'tessdata'),
    path.join(process.cwd(), 'node_modules', '@tesseract.js-data', 'eng', '4.0.0_best_int'),
    path.join(process.cwd(), 'node_modules', '@tesseract.js-data', 'eng', '4.0.0'),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, 'eng.traineddata.gz')) || existsSync(path.join(candidate, 'eng.traineddata'))) {
      cachedLangPath = candidate;
      return cachedLangPath;
    }
  }

  cachedLangPath = null;
  return null;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
