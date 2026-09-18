/**
 * Extracts an embedded text layer from a PDF.
 *
 * Most PDF slips (bank statements, online invoices, e-mailed tax invoices)
 * carry real text, so this is both faster and far more accurate than running
 * an image OCR pass over them. Scanned PDFs have no text layer and return
 * null — the caller then falls back to a cloud OCR provider when one is
 * configured, or to manual entry.
 */
export interface PdfTextResult {
  text: string;
  lines: string[];
  pageCount: number;
}

export async function extractPdfText(buffer: Buffer): Promise<PdfTextResult | null> {
  try {
    // The legacy build runs in Node without DOM or canvas.
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      isEvalSupported: false,
      useSystemFonts: false,
      disableFontFace: true,
    });
    const doc = await loadingTask.promise;
    const lines: string[] = [];

    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();

      // Group text items into visual lines by their y coordinate.
      const rows = new Map<number, Array<{ x: number; text: string }>>();
      for (const item of content.items) {
        if (!('str' in item) || typeof item.str !== 'string' || !item.str.trim()) continue;
        const transform = (item as { transform?: number[] }).transform ?? [];
        const x = transform[4] ?? 0;
        const y = Math.round((transform[5] ?? 0) / 3) * 3; // tolerate sub-pixel drift
        const row = rows.get(y) ?? [];
        row.push({ x, text: item.str });
        rows.set(y, row);
      }

      const sortedRows = [...rows.entries()].sort((a, b) => b[0] - a[0]);
      for (const [, row] of sortedRows) {
        const text = row
          .sort((a, b) => a.x - b.x)
          .map((cell) => cell.text)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (text) lines.push(text);
      }

      page.cleanup();
    }

    await doc.destroy();

    const text = lines.join('\n');
    if (text.replace(/\s/g, '').length < 20) return null; // effectively a scanned page
    return { text, lines, pageCount: doc.numPages };
  } catch {
    return null;
  }
}
