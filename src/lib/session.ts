import { cache } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

export interface WorkspaceSession {
  userId: string;
  email: string;
  firstName: string;
  businessId: string;
  businessName: string;
  currency: string;
  financialYearStartMonth: number;
  folderStructure: 'YEAR_MONTH' | 'YEAR_MONTH_CATEGORY' | 'CATEGORY_ONLY';
  emailVerified: boolean;
  onboarded: boolean;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
}

/**
 * Resolves the caller's session and re-checks it against the database.
 *
 * The JWT alone is not trusted for authorisation: the membership row is what
 * grants access to a workspace, and `sessionVersion` lets a password change
 * invalidate tokens that were issued earlier.
 *
 * Cached per request so a page rendering several server components does not
 * repeat the query.
 */
export const getWorkspaceSession = cache(async (): Promise<WorkspaceSession | null> => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const tokenVersion = (session.user as unknown as { sessionVersion?: number }).sessionVersion;

  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: {
      id: true,
      email: true,
      firstName: true,
      emailVerifiedAt: true,
      sessionVersion: true,
      memberships: {
        orderBy: { createdAt: 'asc' },
        take: 1,
        select: {
          role: true,
          business: {
            select: {
              id: true,
              name: true,
              currency: true,
              financialYearStartMonth: true,
              folderStructure: true,
              onboardingCompletedAt: true,
              deletedAt: true,
            },
          },
        },
      },
    },
  });

  if (!user) return null;
  if (typeof tokenVersion === 'number' && tokenVersion !== user.sessionVersion) return null;

  const membership = user.memberships[0];
  if (!membership || membership.business.deletedAt) return null;

  return {
    userId: user.id,
    email: user.email,
    firstName: user.firstName,
    businessId: membership.business.id,
    businessName: membership.business.name,
    currency: membership.business.currency,
    financialYearStartMonth: membership.business.financialYearStartMonth,
    folderStructure: membership.business.folderStructure,
    emailVerified: Boolean(user.emailVerifiedAt),
    onboarded: Boolean(membership.business.onboardingCompletedAt),
    role: membership.role,
  };
});

/** For server components: redirects to sign-in when there is no valid session. */
export async function requireWorkspace(): Promise<WorkspaceSession> {
  const session = await getWorkspaceSession();
  if (!session) redirect('/login');
  return session;
}

/** For pages that must not be reached before onboarding is finished. */
export async function requireOnboardedWorkspace(): Promise<WorkspaceSession> {
  const session = await requireWorkspace();
  if (!session.onboarded) redirect('/welcome');
  return session;
}
