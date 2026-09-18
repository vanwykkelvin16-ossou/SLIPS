'use client';

/** Browser-side image work for the capture flow: rotate, enhance, crop, deskew. */

export interface Point {
  x: number;
  y: number;
}

/** Four corners in clockwise order from the top-left, in image pixel space. */
export type Quad = [Point, Point, Point, Point];

export async function loadImage(source: Blob | string): Promise<HTMLImageElement> {
  const url = typeof source === 'string' ? source : URL.createObjectURL(source);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('That image could not be opened.'));
      image.src = url;
    });
  } finally {
    if (typeof source !== 'string') {
      // Revoked on the next tick so decoding has finished.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }
}

export function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not process that image.'))),
      'image/jpeg',
      quality,
    );
  });
}

export interface RenderOptions {
  /** 0, 90, 180 or 270 degrees clockwise. */
  rotation: number;
  /** 1 = unchanged. */
  brightness: number;
  contrast: number;
  /** When set, the quad is flattened into a rectangle (perspective correction). */
  quad?: Quad | null;
  /** Longest edge of the output, to keep uploads a sensible size. */
  maxDimension?: number;
}

/**
 * Applies the user's adjustments and returns a new JPEG.
 * The original file is never modified — this always produces a new blob.
 */
export async function renderEditedImage(source: Blob, options: RenderOptions): Promise<Blob> {
  const image = await loadImage(source);

  const base = options.quad
    ? warpQuad(image, options.quad)
    : drawToCanvas(image, image.naturalWidth, image.naturalHeight);

  const rotated = rotateCanvas(base, options.rotation);
  const scaled = scaleCanvas(rotated, options.maxDimension ?? 2400);

  if (options.brightness !== 1 || options.contrast !== 1) {
    const context = scaled.getContext('2d');
    if (context) {
      const filtered = document.createElement('canvas');
      filtered.width = scaled.width;
      filtered.height = scaled.height;
      const filteredContext = filtered.getContext('2d');
      if (filteredContext) {
        filteredContext.filter = `brightness(${options.brightness}) contrast(${options.contrast})`;
        filteredContext.drawImage(scaled, 0, 0);
        return canvasToBlob(filtered);
      }
    }
  }

  return canvasToBlob(scaled);
}

function drawToCanvas(image: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context) context.drawImage(image, 0, 0, width, height);
  return canvas;
}

function rotateCanvas(canvas: HTMLCanvasElement, rotation: number): HTMLCanvasElement {
  const normalised = ((rotation % 360) + 360) % 360;
  if (normalised === 0) return canvas;

  const swap = normalised === 90 || normalised === 270;
  const output = document.createElement('canvas');
  output.width = swap ? canvas.height : canvas.width;
  output.height = swap ? canvas.width : canvas.height;

  const context = output.getContext('2d');
  if (!context) return canvas;

  context.translate(output.width / 2, output.height / 2);
  context.rotate((normalised * Math.PI) / 180);
  context.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return output;
}

function scaleCanvas(canvas: HTMLCanvasElement, maxDimension: number): HTMLCanvasElement {
  const longest = Math.max(canvas.width, canvas.height);
  if (longest <= maxDimension) return canvas;

  const scale = maxDimension / longest;
  const output = document.createElement('canvas');
  output.width = Math.round(canvas.width * scale);
  output.height = Math.round(canvas.height * scale);

  const context = output.getContext('2d');
  if (!context) return canvas;
  context.imageSmoothingQuality = 'high';
  context.drawImage(canvas, 0, 0, output.width, output.height);
  return output;
}

/**
 * Perspective correction.
 *
 * Solves the homography that maps the user's four corner points onto a
 * rectangle, then inverse-maps each output pixel with bilinear sampling — so a
 * slip photographed at an angle comes out flat and square.
 */
export function warpQuad(image: HTMLImageElement, quad: Quad): HTMLCanvasElement {
  const [tl, tr, br, bl] = quad;

  const widthTop = distance(tl, tr);
  const widthBottom = distance(bl, br);
  const heightLeft = distance(tl, bl);
  const heightRight = distance(tr, br);

  const outWidth = Math.max(32, Math.round(Math.max(widthTop, widthBottom)));
  const outHeight = Math.max(32, Math.round(Math.max(heightLeft, heightRight)));

  const source = drawToCanvas(image, image.naturalWidth, image.naturalHeight);
  const sourceContext = source.getContext('2d', { willReadFrequently: true });
  if (!sourceContext) return source;

  const sourceData = sourceContext.getImageData(0, 0, source.width, source.height);
  const output = document.createElement('canvas');
  output.width = outWidth;
  output.height = outHeight;
  const outputContext = output.getContext('2d');
  if (!outputContext) return source;

  const outputData = outputContext.createImageData(outWidth, outHeight);

  // Homography mapping the destination rectangle back onto the source quad.
  const h = solveHomography(
    [
      { x: 0, y: 0 },
      { x: outWidth, y: 0 },
      { x: outWidth, y: outHeight },
      { x: 0, y: outHeight },
    ],
    quad,
  );
  if (!h) return source;

  const src = sourceData.data;
  const dst = outputData.data;
  const sw = sourceData.width;
  const sh = sourceData.height;

  for (let y = 0; y < outHeight; y += 1) {
    for (let x = 0; x < outWidth; x += 1) {
      const denominator = h[6]! * x + h[7]! * y + 1;
      const sx = (h[0]! * x + h[1]! * y + h[2]!) / denominator;
      const sy = (h[3]! * x + h[4]! * y + h[5]!) / denominator;
      const target = (y * outWidth + x) * 4;

      if (sx < 0 || sy < 0 || sx >= sw - 1 || sy >= sh - 1) {
        dst[target] = 255;
        dst[target + 1] = 255;
        dst[target + 2] = 255;
        dst[target + 3] = 255;
        continue;
      }

      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;

      for (let channel = 0; channel < 3; channel += 1) {
        const p00 = src[(y0 * sw + x0) * 4 + channel] ?? 0;
        const p10 = src[(y0 * sw + x0 + 1) * 4 + channel] ?? 0;
        const p01 = src[((y0 + 1) * sw + x0) * 4 + channel] ?? 0;
        const p11 = src[((y0 + 1) * sw + x0 + 1) * 4 + channel] ?? 0;
        const top = p00 + (p10 - p00) * fx;
        const bottom = p01 + (p11 - p01) * fx;
        dst[target + channel] = top + (bottom - top) * fy;
      }
      dst[target + 3] = 255;
    }
  }

  outputContext.putImageData(outputData, 0, 0);
  return output;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Solves the 8 homography coefficients mapping `from` onto `to`. */
function solveHomography(from: Point[], to: Point[]): number[] | null {
  const matrix: number[][] = [];
  const rhs: number[] = [];

  for (let i = 0; i < 4; i += 1) {
    const source = from[i]!;
    const target = to[i]!;
    matrix.push([source.x, source.y, 1, 0, 0, 0, -source.x * target.x, -source.y * target.x]);
    rhs.push(target.x);
    matrix.push([0, 0, 0, source.x, source.y, 1, -source.x * target.y, -source.y * target.y]);
    rhs.push(target.y);
  }

  return gaussianSolve(matrix, rhs);
}

function gaussianSolve(matrix: number[][], rhs: number[]): number[] | null {
  const size = rhs.length;
  const augmented = matrix.map((row, index) => [...row, rhs[index]!]);

  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row]![column]!) > Math.abs(augmented[pivot]![column]!)) pivot = row;
    }
    if (Math.abs(augmented[pivot]![column]!) < 1e-10) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot]!, augmented[column]!];

    const pivotRow = augmented[column]!;
    const pivotValue = pivotRow[column]!;
    for (let i = column; i <= size; i += 1) pivotRow[i] = pivotRow[i]! / pivotValue;

    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row]![column]!;
      if (factor === 0) continue;
      for (let i = column; i <= size; i += 1) {
        augmented[row]![i] = augmented[row]![i]! - factor * pivotRow[i]!;
      }
    }
  }

  return augmented.map((row) => row[size]!);
}

/**
 * Sharpness estimate (variance of the Laplacian), normalised to 0-1.
 * Used to warn before someone saves a photo nothing can be read from.
 */
export async function estimateSharpness(source: Blob): Promise<number | null> {
  try {
    const image = await loadImage(source);
    const width = 480;
    const height = Math.max(1, Math.round((image.naturalHeight / image.naturalWidth) * width));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;

    context.drawImage(image, 0, 0, width, height);
    const { data } = context.getImageData(0, 0, width, height);

    const grey = new Float32Array(width * height);
    for (let i = 0; i < grey.length; i += 1) {
      const offset = i * 4;
      grey[i] = 0.299 * (data[offset] ?? 0) + 0.587 * (data[offset + 1] ?? 0) + 0.114 * (data[offset + 2] ?? 0);
    }

    let sum = 0;
    let sumSquares = 0;
    let count = 0;
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = y * width + x;
        const laplacian =
          4 * grey[index]! - grey[index - 1]! - grey[index + 1]! - grey[index - width]! - grey[index + width]!;
        sum += laplacian;
        sumSquares += laplacian * laplacian;
        count += 1;
      }
    }

    if (count === 0) return null;
    const mean = sum / count;
    const variance = sumSquares / count - mean * mean;
    return Math.max(0, Math.min(1, variance / 250));
  } catch {
    return null;
  }
}

export const BLUR_WARNING_THRESHOLD = 0.22;
