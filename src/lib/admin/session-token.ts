import { SignJWT, jwtVerify } from 'jose';

/**
 * Admin session token, kept free of Node built-ins, Prisma and bcrypt so the
 * edge middleware can verify it. Signature checking here is only a gate —
 * every admin page and API route re-checks the account in the database.
 */
export const ADMIN_COOKIE = 'slipsy_admin_session';

const ISSUER = 'slipsy';
const AUDIENCE = 'slipsy-admin';
export const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;

let keyCache: Uint8Array | null = null;

function sessionKey(): Uint8Array {
  if (keyCache) return keyCache;

  // Static property reads so the values are inlined for the edge runtime.
  const dedicated = process.env.ADMIN_SESSION_SECRET;
  const fallback = process.env.AUTH_SECRET;
  const material = dedicated && dedicated.length >= 32 ? dedicated : `${fallback ?? ''}:slipsy-admin-session`;

  if (material.length < 32) {
    throw new Error('ADMIN_SESSION_SECRET or AUTH_SECRET must be set to sign admin sessions.');
  }

  keyCache = new TextEncoder().encode(material);
  return keyCache;
}

export interface AdminTokenClaims {
  adminId: string;
  sessionVersion: number;
}

export async function signAdminToken(claims: AdminTokenClaims): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sv: claims.sessionVersion })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.adminId)
    .setIssuedAt(now)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(now + ADMIN_SESSION_TTL_SECONDS)
    .sign(sessionKey());
}

export async function verifyAdminToken(token: string): Promise<AdminTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, sessionKey(), { issuer: ISSUER, audience: AUDIENCE });
    if (typeof payload.sub !== 'string' || typeof payload.sv !== 'number') return null;
    return { adminId: payload.sub, sessionVersion: payload.sv };
  } catch {
    return null;
  }
}
