import { randomUUID } from 'node:crypto';
import { getEnv } from '@/lib/env';
import { LocalStorageAdapter } from './local';
import { S3StorageAdapter } from './s3';
import type { StorageAdapter } from './types';

export type { StorageAdapter, StoredObject } from './types';

let adapter: StorageAdapter | null = null;

export function getStorage(): StorageAdapter {
  if (adapter) return adapter;
  const env = getEnv();

  /*
   * A serverless host gives each invocation its own throwaway filesystem, so
   * the local driver would appear to work and then lose every slip. Refuse it
   * loudly instead — the failure is obvious at the first upload rather than
   * weeks later when someone looks for a receipt.
   */
  if (env.STORAGE_DRIVER === 'local' && process.env.VERCEL === '1') {
    throw new Error(
      'STORAGE_DRIVER=local cannot be used on Vercel: the filesystem is not persistent and uploaded slips would be lost. ' +
        'Set STORAGE_DRIVER=s3 with S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.',
    );
  }

  if (env.STORAGE_DRIVER === 's3') {
    if (!env.S3_BUCKET || !env.S3_REGION) {
      throw new Error('STORAGE_DRIVER=s3 requires S3_BUCKET and S3_REGION to be set.');
    }
    adapter = new S3StorageAdapter({
      bucket: env.S3_BUCKET,
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    });
  } else {
    adapter = new LocalStorageAdapter(env.STORAGE_LOCAL_PATH);
  }

  return adapter;
}

/** Test seam. */
export function setStorage(next: StorageAdapter | null) {
  adapter = next;
}

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'text/csv': 'csv',
  'application/json': 'json',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

/**
 * Builds an opaque storage key. Nothing from the uploaded filename survives —
 * only a random UUID and a mime-derived extension — so a hostile filename can
 * never influence the path.
 */
export function buildStorageKey(parts: {
  businessId: string;
  scope: 'receipts' | 'exports' | 'thumbnails' | 'previews';
  mimeType: string;
  date?: Date;
}): string {
  const date = parts.date ?? new Date();
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const ext = EXTENSION_BY_MIME[parts.mimeType] ?? 'bin';
  const safeBusinessId = parts.businessId.replace(/[^A-Za-z0-9_-]/g, '');
  return `businesses/${safeBusinessId}/${parts.scope}/${year}/${month}/${randomUUID()}.${ext}`;
}
