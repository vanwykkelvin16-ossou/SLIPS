import sharp from 'sharp';

export const THUMBNAIL_WIDTH = 400;
export const PREVIEW_WIDTH = 1400;

export interface ProcessedImage {
  buffer: Buffer;
  mimeType: 'image/jpeg';
  width: number;
  height: number;
}

/**
 * Downscaled, compressed derivative used in the library grid. The original file
 * is never modified — derivatives exist purely so phones do not download
 * multi-megabyte photographs to render a list.
 */
export async function makeThumbnail(input: Buffer): Promise<ProcessedImage | null> {
  return resizeToJpeg(input, THUMBNAIL_WIDTH, 72);
}

/** Screen-sized preview for the receipt detail view. */
export async function makePreview(input: Buffer): Promise<ProcessedImage | null> {
  return resizeToJpeg(input, PREVIEW_WIDTH, 82);
}

async function resizeToJpeg(input: Buffer, width: number, quality: number): Promise<ProcessedImage | null> {
  try {
    const pipeline = sharp(input, { failOn: 'none' })
      .rotate() // honours EXIF orientation
      .resize({ width, withoutEnlargement: true, fit: 'inside' })
      .jpeg({ quality, mozjpeg: true });
    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    return { buffer: data, mimeType: 'image/jpeg', width: info.width, height: info.height };
  } catch {
    return null;
  }
}

export async function imageDimensions(input: Buffer): Promise<{ width: number; height: number } | null> {
  try {
    const metadata = await sharp(input, { failOn: 'none' }).metadata();
    if (!metadata.width || !metadata.height) return null;
    return { width: metadata.width, height: metadata.height };
  } catch {
    return null;
  }
}

/**
 * HEIC/HEIF conversion. sharp only handles HEIC when libvips was compiled with
 * libheif; when it was not, callers keep the original file and fall back to
 * manual entry rather than failing the upload.
 */
export async function convertHeicToJpeg(input: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(input, { failOn: 'none' }).rotate().jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  } catch {
    return null;
  }
}

export async function supportsHeic(): Promise<boolean> {
  try {
    const formats = sharp.format as unknown as Record<string, { input?: { buffer?: boolean } }>;
    return Boolean(formats.heif?.input?.buffer);
  } catch {
    return false;
  }
}

/**
 * Prepares an image for OCR: greyscale, normalised contrast and a sensible
 * working width. Measurably improves Tesseract accuracy on phone photographs
 * of till slips.
 */
export async function enhanceForOcr(input: Buffer): Promise<Buffer> {
  try {
    return await sharp(input, { failOn: 'none' })
      .rotate()
      .resize({ width: 2000, withoutEnlargement: true, fit: 'inside' })
      .greyscale()
      .normalise()
      .sharpen()
      .png()
      .toBuffer();
  } catch {
    return input;
  }
}

/**
 * Blur estimate via variance of the Laplacian, scaled to 0-1 where higher is
 * sharper. Used to warn the user before they save an unreadable photo.
 */
export async function estimateSharpness(input: Buffer): Promise<number | null> {
  try {
    const { data, info } = await sharp(input, { failOn: 'none' })
      .greyscale()
      .resize({ width: 600, withoutEnlargement: true, fit: 'inside' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height } = info;
    if (width < 3 || height < 3) return null;

    let sum = 0;
    let sumSquares = 0;
    let count = 0;

    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const idx = y * width + x;
        const centre = data[idx] ?? 0;
        const up = data[idx - width] ?? 0;
        const down = data[idx + width] ?? 0;
        const left = data[idx - 1] ?? 0;
        const right = data[idx + 1] ?? 0;
        const laplacian = 4 * centre - up - down - left - right;
        sum += laplacian;
        sumSquares += laplacian * laplacian;
        count += 1;
      }
    }

    if (count === 0) return null;
    const mean = sum / count;
    const variance = sumSquares / count - mean * mean;
    // ~100+ variance is a crisp document scan; normalise into 0-1.
    return Math.max(0, Math.min(1, variance / 250));
  } catch {
    return null;
  }
}
