import { createHash } from 'node:crypto';
import { getEnv } from '@/lib/env';
import { ALLOWED_UPLOAD_MIME_TYPES, extensionForMime, type AllowedUploadMime } from './upload-constraints';

export {
  ALLOWED_UPLOAD_MIME_TYPES,
  ALLOWED_UPLOAD_EXTENSIONS,
  UPLOAD_ACCEPT_ATTRIBUTE,
  extensionForMime,
  type AllowedUploadMime,
} from './upload-constraints';

export interface FileValidationSuccess {
  ok: true;
  mimeType: AllowedUploadMime;
  extension: string;
  sizeBytes: number;
  sha256: string;
}

export interface FileValidationFailure {
  ok: false;
  code: 'EMPTY' | 'TOO_LARGE' | 'UNSUPPORTED_TYPE' | 'CONTENT_MISMATCH' | 'MALWARE_SUSPECTED';
  message: string;
}

export type FileValidationResult = FileValidationSuccess | FileValidationFailure;

/**
 * Detects the real type of a buffer from its magic bytes. The client-supplied
 * Content-Type is treated as a hint only and never trusted.
 */
export function sniffMimeType(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';

  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';

  if (buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') {
    return 'image/webp';
  }

  // ISO-BMFF container: check the brand at offset 8 for HEIC/HEIF.
  if (buffer.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString('latin1');
    if (['heic', 'heix', 'hevc', 'heim', 'heis', 'hevm'].includes(brand)) return 'image/heic';
    if (['mif1', 'msf1', 'heif'].includes(brand)) return 'image/heif';
  }

  return null;
}

export function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Full server-side validation of an uploaded buffer: size, real content type,
 * declared-type agreement, and the malware-scanning hook.
 */
export async function validateUpload(
  buffer: Buffer,
  declaredMimeType: string | undefined,
  options: { maxBytes?: number } = {},
): Promise<FileValidationResult> {
  const env = getEnv();
  const maxBytes = options.maxBytes ?? env.MAX_UPLOAD_BYTES;

  if (buffer.byteLength === 0) {
    return { ok: false, code: 'EMPTY', message: 'That file is empty. Please choose another one.' };
  }

  if (buffer.byteLength > maxBytes) {
    const mb = Math.round((maxBytes / (1024 * 1024)) * 10) / 10;
    return { ok: false, code: 'TOO_LARGE', message: `Files must be ${mb} MB or smaller.` };
  }

  const detected = sniffMimeType(buffer);
  if (!detected || !ALLOWED_UPLOAD_MIME_TYPES.includes(detected as AllowedUploadMime)) {
    return {
      ok: false,
      code: 'UNSUPPORTED_TYPE',
      message: 'Only JPG, PNG, WebP, HEIC and PDF files can be uploaded.',
    };
  }

  // A declared type that disagrees with the real bytes is a red flag, except for
  // the HEIC/HEIF pair and generic octet-stream which browsers often send.
  if (declaredMimeType && declaredMimeType !== 'application/octet-stream') {
    const normalisedDeclared = declaredMimeType.split(';')[0]?.trim().toLowerCase() ?? '';
    const heicPair = ['image/heic', 'image/heif'];
    const agrees =
      normalisedDeclared === detected ||
      (heicPair.includes(normalisedDeclared) && heicPair.includes(detected)) ||
      (normalisedDeclared === 'image/jpg' && detected === 'image/jpeg');
    if (!agrees) {
      return {
        ok: false,
        code: 'CONTENT_MISMATCH',
        message: 'That file’s contents do not match its type. Please upload it again.',
      };
    }
  }

  const scan = await scanForMalware(buffer);
  if (!scan.clean) {
    return {
      ok: false,
      code: 'MALWARE_SUSPECTED',
      message: 'That file did not pass our safety check and was not stored.',
    };
  }

  return {
    ok: true,
    mimeType: detected as AllowedUploadMime,
    extension: extensionForMime(detected),
    sizeBytes: buffer.byteLength,
    sha256: sha256(buffer),
  };
}

export interface MalwareScanResult {
  clean: boolean;
  provider: string;
  detail?: string;
}

/**
 * Malware-scanning integration point.
 *
 * `none` (the default) performs structural sanity checks only. Set
 * MALWARE_SCAN_PROVIDER=clamav with CLAMAV_HOST/CLAMAV_PORT to stream uploads
 * to a clamd instance, or `webhook` with MALWARE_SCAN_WEBHOOK_URL to POST them
 * to an external scanning service.
 */
export async function scanForMalware(buffer: Buffer): Promise<MalwareScanResult> {
  const env = getEnv();

  if (env.MALWARE_SCAN_PROVIDER === 'clamav' && env.CLAMAV_HOST) {
    return scanWithClamav(buffer, env.CLAMAV_HOST, env.CLAMAV_PORT ?? 3310);
  }

  if (env.MALWARE_SCAN_PROVIDER === 'webhook' && env.MALWARE_SCAN_WEBHOOK_URL) {
    try {
      const response = await fetch(env.MALWARE_SCAN_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: new Uint8Array(buffer),
      });
      if (!response.ok) return { clean: false, provider: 'webhook', detail: `scanner returned ${response.status}` };
      const result = (await response.json()) as { clean?: boolean };
      return { clean: result.clean === true, provider: 'webhook' };
    } catch {
      // Fail closed: if the scanner is unreachable the upload is rejected.
      return { clean: false, provider: 'webhook', detail: 'scanner unreachable' };
    }
  }

  return { clean: !containsExecutableSignature(buffer), provider: 'none' };
}

async function scanWithClamav(buffer: Buffer, host: string, port: number): Promise<MalwareScanResult> {
  const { connect } = await import('node:net');
  return new Promise<MalwareScanResult>((resolve) => {
    const socket = connect({ host, port });
    let response = '';
    socket.setTimeout(15_000);
    socket.on('connect', () => {
      socket.write('zINSTREAM\0');
      const chunkSize = 8192;
      for (let offset = 0; offset < buffer.length; offset += chunkSize) {
        const chunk = buffer.subarray(offset, offset + chunkSize);
        const header = Buffer.alloc(4);
        header.writeUInt32BE(chunk.length, 0);
        socket.write(header);
        socket.write(chunk);
      }
      const terminator = Buffer.alloc(4);
      terminator.writeUInt32BE(0, 0);
      socket.write(terminator);
    });
    socket.on('data', (chunk) => {
      response += chunk.toString('utf8');
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ clean: false, provider: 'clamav', detail: 'timeout' });
    });
    socket.on('error', () => resolve({ clean: false, provider: 'clamav', detail: 'connection error' }));
    socket.on('close', () => {
      resolve({ clean: response.includes('OK') && !response.includes('FOUND'), provider: 'clamav' });
    });
  });
}

/** Cheap structural check for content that should never appear in a slip. */
function containsExecutableSignature(buffer: Buffer): boolean {
  const head = buffer.subarray(0, 4);
  if (head[0] === 0x4d && head[1] === 0x5a) return true; // DOS/PE executable
  if (head[0] === 0x7f && head.subarray(1, 4).toString('latin1') === 'ELF') return true;
  if (head.toString('hex') === 'cafebabe') return true; // Java class / Mach-O fat binary
  return false;
}
