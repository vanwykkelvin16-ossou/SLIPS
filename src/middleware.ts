import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/auth.config';
import { ADMIN_COOKIE, verifyAdminToken } from '@/lib/admin/session-token';

const { auth } = NextAuth(authConfig);

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/scan',
  '/slips',
  '/folders',
  '/exports',
  '/settings',
  '/business',
  '/more',
  '/help',
  '/welcome',
];

const AUTH_ONLY_PAGES = ['/login', '/signup'];

/**
 * First line of route protection. It only inspects the signed session cookie —
 * the authoritative check (membership + session revocation) runs server-side in
 * every page and API route via `getWorkspaceSession`.
 */
/**
 * Gate for the admin portal. The signature check here only avoids rendering a
 * page to an unauthenticated visitor — `requireAdmin()` re-validates the
 * account against the database on every admin page and API route.
 */
async function adminGate(request: Request, nextUrl: URL): Promise<NextResponse | null> {
  const pathname = nextUrl.pathname;
  if (!pathname.startsWith('/admin')) return null;

  const cookieHeader = request.headers.get('cookie') ?? '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${ADMIN_COOKIE}=([^;]+)`));
  const claims = match?.[1] ? await verifyAdminToken(decodeURIComponent(match[1])) : null;

  if (pathname === '/admin/login') {
    return claims ? NextResponse.redirect(new URL('/admin', nextUrl.origin)) : NextResponse.next();
  }

  return claims ? NextResponse.next() : NextResponse.redirect(new URL('/admin/login', nextUrl.origin));
}

export default auth(async (request) => {
  const { nextUrl } = request;
  const pathname = nextUrl.pathname;
  const signedIn = Boolean(request.auth?.user);

  const adminResponse = await adminGate(request, nextUrl);
  if (adminResponse) return adminResponse;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !signedIn) {
    const loginUrl = new URL('/login', nextUrl.origin);
    if (pathname !== '/dashboard') loginUrl.searchParams.set('next', pathname + nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  if (signedIn && AUTH_ONLY_PAGES.includes(pathname)) {
    return NextResponse.redirect(new URL('/dashboard', nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Everything except Next internals, the service worker, and static assets.
    '/((?!api/auth|_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/|og-image.png).*)',
  ],
};
