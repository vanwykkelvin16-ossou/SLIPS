import { createHash } from 'node:crypto';
import { getEnv } from '@/lib/env';

/** Best-effort client IP from proxy headers, used only for rate limiting and audit hashes. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip') ?? request.headers.get('cf-connecting-ip') ?? 'unknown';
}

/**
 * Audit logs store a keyed hash of the IP rather than the address itself, so
 * the log is useful for spotting abuse without becoming a store of personal
 * location data (POPIA data-minimisation).
 */
export function hashIp(ip: string): string {
  return createHash('sha256').update(`${getEnv().FILE_SIGNING_SECRET}:${ip}`).digest('hex').slice(0, 32);
}

export function userAgent(request: Request): string | null {
  const value = request.headers.get('user-agent');
  return value ? value.slice(0, 250) : null;
}

/**
 * Same-origin check for state-changing requests. NextAuth protects its own
 * endpoints with a CSRF token; this guards the application's own mutation
 * routes, which are cookie-authenticated.
 */
export function isSameOrigin(request: Request): boolean {
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;

  const origin = request.headers.get('origin');
  // Same-origin fetches from a browser always send Origin for unsafe methods.
  if (!origin) return true;

  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!host) return false;

  try {
    const originHost = new URL(origin).host;
    if (originHost === host) return true;
    const configured = process.env.NEXT_PUBLIC_APP_URL ?? process.env.AUTH_URL;
    if (configured && new URL(configured).host === originHost) return true;
    return false;
  } catch {
    return false;
  }
}
