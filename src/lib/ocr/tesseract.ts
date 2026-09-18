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
    const worker = await createWorker('eng');

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

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
