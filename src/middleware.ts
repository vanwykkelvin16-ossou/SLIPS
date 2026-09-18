import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/auth.config';

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
export default auth((request) => {
  const { nextUrl } = request;
  const pathname = nextUrl.pathname;
  const signedIn = Boolean(request.auth?.user);

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
