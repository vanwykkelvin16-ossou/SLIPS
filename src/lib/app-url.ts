/**
 * Where this deployment lives, as an absolute origin.
 *
 * The configured value is whatever someone typed into a hosting dashboard, so
 * it may be a bare hostname, carry a trailing slash, or be missing entirely.
 * `new URL()` throws on the first of those, and doing that at module scope
 * fails the build rather than the request — so every read of the app URL goes
 * through here, and this never throws.
 */

/** Returns the origin for a configured value, or null if it cannot be one. */
export function normaliseAppUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  /*
   * A dashboard value like "slipsy.vercel.app" is a hostname, not a URL. The
   * scheme test runs on the untouched string — trimming a trailing slash first
   * would turn "http://" into "http:" and then into the host "http". Any path
   * or trailing slash is discarded by reading `.origin` below.
   */
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(withScheme);
    if (!url.hostname) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * The app's public origin. Falls back through the host's own variables so a
 * deployment still knows its address when nobody has configured one, and
 * finally to localhost for development.
 */
export function appUrl(): string {
  return (
    normaliseAppUrl(process.env.NEXT_PUBLIC_APP_URL) ??
    normaliseAppUrl(process.env.AUTH_URL) ??
    // Vercel sets both: the first is the stable production domain, the second
    // the URL of this particular deployment. Neither carries a scheme.
    normaliseAppUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
    normaliseAppUrl(process.env.VERCEL_URL) ??
    'http://localhost:3000'
  );
}
