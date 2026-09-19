/**
 * Upload rules shared by the browser and the server.
 *
 * Kept free of Node built-ins so client components can import it — the server
 * still re-checks every one of these against the real bytes in
 * `src/lib/storage/validate.ts`. Nothing here is a security control on its own.
 */

export const ALLOWED_UPLOAD_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
] as const;

export type AllowedUploadMime = (typeof ALLOWED_UPLOAD_MIME_TYPES)[number];

export const ALLOWED_UPLOAD_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'pdf'] as const;

/** Value for an <input type="file"> accept attribute. */
export const UPLOAD_ACCEPT_ATTRIBUTE = 'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf';

export function extensionForMime(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/heic':
      return 'heic';
    case 'image/heif':
      return 'heif';
    case 'application/pdf':
      return 'pdf';
    default:
      return 'bin';
  }
}
