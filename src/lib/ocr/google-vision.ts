import { getEnv } from '@/lib/env';
import type { OcrProvider, OcrRawResult } from './types';

interface VisionResponse {
  responses?: Array<{
    fullTextAnnotation?: {
      text?: string;
      pages?: Array<{
        blocks?: Array<{
          confidence?: number;
          paragraphs?: Array<{
            confidence?: number;
            words?: Array<{ symbols?: Array<{ text?: string }>; confidence?: number }>;
          }>;
        }>;
      }>;
    };
    error?: { message?: string };
  }>;
}

/**
 * Google Cloud Vision `DOCUMENT_TEXT_DETECTION`.
 * Requires GOOGLE_VISION_API_KEY (an API key restricted to the Vision API).
 */
export class GoogleVisionOcrProvider implements OcrProvider {
  readonly name = 'google-vision';

  isConfigured(): boolean {
    return Boolean(getEnv().GOOGLE_VISION_API_KEY);
  }

  async extract({ buffer, mimeType }: { buffer: Buffer; mimeType: string }): Promise<OcrRawResult> {
    const apiKey = getEnv().GOOGLE_VISION_API_KEY;
    if (!apiKey) throw new Error('GOOGLE_VISION_API_KEY is not configured');

    const isPdf = mimeType === 'application/pdf';
    const endpoint = isPdf
      ? `https://vision.googleapis.com/v1/files:annotate?key=${encodeURIComponent(apiKey)}`
      : `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`;

    const body = isPdf
      ? {
          requests: [
            {
              inputConfig: { content: buffer.toString('base64'), mimeType: 'application/pdf' },
              features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
              pages: [1, 2, 3, 4, 5],
            },
          ],
        }
      : {
          requests: [
            {
              image: { content: buffer.toString('base64') },
              features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
              imageContext: { languageHints: ['en'] },
            },
          ],
        };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Google Vision request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as VisionResponse & {
      responses?: Array<{ responses?: VisionResponse['responses'] }>;
    };

    // The files:annotate shape nests one level deeper than images:annotate.
    const first = isPdf ? payload.responses?.[0]?.responses?.[0] : payload.responses?.[0];
    if (first?.error?.message) throw new Error(`Google Vision: ${first.error.message}`);

    const text = first?.fullTextAnnotation?.text ?? '';
    const confidences: number[] = [];
    for (const page of first?.fullTextAnnotation?.pages ?? []) {
      for (const block of page.blocks ?? []) {
        if (typeof block.confidence === 'number') confidences.push(block.confidence);
      }
    }
    const confidence = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : text ? 0.85 : 0;

    const lines = text
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .map((line) => ({ text: line, confidence }));

    return { provider: this.name, text, lines, confidence };
  }
}
