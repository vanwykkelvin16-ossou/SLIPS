import bcrypt from 'bcryptjs';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authConfig } from '@/auth.config';
import { prisma } from '@/lib/db';
import { loginSchema } from '@/lib/validation';

const LOCKOUT_THRESHOLD = 8;
const LOCKOUT_MINUTES = 15;

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      firstName: string;
      businessId: string;
      businessName: string;
      isEmailVerified: boolean;
      onboarded: boolean;
    } & Record<string, unknown>;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'E-mail', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({
          where: { email },
          include: { memberships: { orderBy: { createdAt: 'asc' }, take: 1, include: { business: true } } },
        });

        // Constant-ish work whether or not the account exists, so response
        // timing does not reveal which e-mail addresses are registered.
        if (!user || user.deletedAt) {
          await bcrypt.compare(password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin');
          return null;
        }

        if (user.lockedUntil && user.lockedUntil > new Date()) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          const failedLogins = user.failedLogins + 1;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLogins,
              lockedUntil:
                failedLogins >= LOCKOUT_THRESHOLD ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : user.lockedUntil,
            },
          });
          return null;
        }

        const membership = user.memberships[0];
        if (!membership) return null;

        await prisma.user.update({
          where: { id: user.id },
          data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.firstName,
          firstName: user.firstName,
          businessId: membership.businessId,
          businessName: membership.business.name,
          emailVerified: Boolean(user.emailVerifiedAt),
          onboarded: Boolean(membership.business.onboardingCompletedAt),
          sessionVersion: user.sessionVersion,
        } as never;
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger }) {
      if (user) {
        const typed = user as unknown as {
          id: string;
          email: string;
          firstName: string;
          businessId: string;
          businessName: string;
          emailVerified: boolean;
          onboarded: boolean;
          sessionVersion: number;
        };
        token.sub = typed.id;
        token.email = typed.email;
        token.firstName = typed.firstName;
        token.businessId = typed.businessId;
        token.businessName = typed.businessName;
        token.isEmailVerified = typed.emailVerified;
        token.onboarded = typed.onboarded;
        token.sessionVersion = typed.sessionVersion;
      }

      // Refresh the denormalised claims when the client calls `update()`
      // (after onboarding, e-mail verification or a profile change).
      if (trigger === 'update' && token.sub) {
        const fresh = await prisma.user.findUnique({
          where: { id: token.sub },
          include: { memberships: { orderBy: { createdAt: 'asc' }, take: 1, include: { business: true } } },
        });
        if (fresh) {
          const membership = fresh.memberships[0];
          token.email = fresh.email;
          token.firstName = fresh.firstName;
          token.isEmailVerified = Boolean(fresh.emailVerifiedAt);
          token.sessionVersion = fresh.sessionVersion;
          if (membership) {
            token.businessId = membership.businessId;
            token.businessName = membership.business.name;
            token.onboarded = Boolean(membership.business.onboardingCompletedAt);
          }
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (token.sub) {
        session.user = {
          ...session.user,
          id: token.sub,
          email: (token.email as string) ?? '',
          firstName: (token.firstName as string) ?? '',
          businessId: (token.businessId as string) ?? '',
          businessName: (token.businessName as string) ?? '',
          isEmailVerified: Boolean(token.isEmailVerified),
          onboarded: Boolean(token.onboarded),
          sessionVersion: token.sessionVersion as number,
        };
      }
      return session;
    },
  },
});
