import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Single-use tokens for e-mail verification and password reset.
 *
 * Only the SHA-256 hash is stored, so a database copy cannot be used to take
 * over accounts. Tokens are 32 random bytes, URL-safe.
 */
export function createToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function safeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
