import type { NextAuthConfig } from 'next-auth';

/**
 * Edge-safe half of the auth configuration.
 *
 * Middleware runs on the edge runtime where Prisma and bcrypt cannot run, so it
 * only reads the signed session cookie. Full validation — including session
 * revocation — happens in `src/lib/session.ts` on the Node side.
 */
export const authConfig = {
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  trustHost: true,
  providers: [],
  callbacks: {
    authorized({ auth }) {
      return Boolean(auth?.user);
    },
  },
} satisfies NextAuthConfig;
