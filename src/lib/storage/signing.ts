import { SignJWT, jwtVerify } from 'jose';
import { getEnv } from '@/lib/env';

const ISSUER = 'slipsy';
const AUDIENCE = 'slipsy-file-access';

let keyCache: Uint8Array | null = null;
function signingKey(): Uint8Array {
  if (!keyCache) keyCache = new TextEncoder().encode(getEnv().FILE_SIGNING_SECRET);
  return keyCache;
}

export interface FileGrant {
  /** ReceiptFile id or ExportJob id. */
  resourceId: string;
  resourceType: 'receipt-file' | 'export';
  businessId: string;
  /** Forces a download with this filename instead of inline display. */
  downloadFilename?: string;
}

/**
 * Issues a short-lived bearer token for one specific document belonging to one
 * specific business. Tokens are opaque, expire quickly, and are re-checked
 * against the database on every read — so a leaked token cannot be replayed
 * against another business's documents.
 */
export async function signFileToken(grant: FileGrant, expiresInSeconds = 300): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    rid: grant.resourceId,
    rtype: grant.resourceType,
    bid: grant.businessId,
    ...(grant.downloadFilename ? { dl: grant.downloadFilename } : {}),
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(now)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(now + expiresInSeconds)
    .sign(signingKey());
}

export async function verifyFileToken(token: string): Promise<FileGrant | null> {
  try {
    const { payload } = await jwtVerify(token, signingKey(), { issuer: ISSUER, audience: AUDIENCE });
    const resourceId = payload.rid;
    const resourceType = payload.rtype;
    const businessId = payload.bid;
    if (typeof resourceId !== 'string' || typeof businessId !== 'string') return null;
    if (resourceType !== 'receipt-file' && resourceType !== 'export') return null;
    return {
      resourceId,
      resourceType,
      businessId,
      ...(typeof payload.dl === 'string' ? { downloadFilename: payload.dl } : {}),
    };
  } catch {
    return null;
  }
}

/** Builds the app-relative signed URL used by <img> tags and download links. */
export async function signedFileUrl(grant: FileGrant, expiresInSeconds = 300): Promise<string> {
  const token = await signFileToken(grant, expiresInSeconds);
  const base = grant.resourceType === 'export' ? '/api/files/export' : '/api/files/receipt';
  return `${base}?token=${encodeURIComponent(token)}`;
}
