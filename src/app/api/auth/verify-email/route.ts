import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sendVerificationEmail } from '@/lib/accounts';
import { HttpError, parseJson, withPublicRoute } from '@/lib/api';
import { recordAudit } from '@/lib/audit';
import { hashToken } from '@/lib/auth-tokens';
import { prisma } from '@/lib/db';
import { getWorkspaceSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const verifySchema = z.object({ token: z.string().min(10) });

export const POST = withPublicRoute(
  async ({ request }) => {
    const { token } = await parseJson(request, verifySchema);

    const record = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { select: { id: true, emailVerifiedAt: true, deletedAt: true } } },
    });

    if (!record || record.usedAt || record.expiresAt < new Date() || record.user.deletedAt) {
      throw new HttpError(400, 'That confirmation link has expired. Ask for a new one below.', 'invalid_token');
    }

    if (!record.user.emailVerifiedAt) {
      await prisma.$transaction([
        prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } }),
        prisma.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      ]);

      await recordAudit({
        action: 'user.email_verified',
        entityType: 'user',
        entityId: record.userId,
        userId: record.userId,
        request,
      });
    }

    return NextResponse.json({ ok: true });
  },
  { rateLimit: 'passwordReset' },
);

/** Re-sends the confirmation link to the signed-in user. */
export const PUT = withPublicRoute(
  async () => {
    const session = await getWorkspaceSession();
    if (!session) throw new HttpError(401, 'Please sign in to continue.', 'unauthorized');
    if (session.emailVerified) return NextResponse.json({ ok: true, alreadyVerified: true });

    await sendVerificationEmail(session.userId);
    return NextResponse.json({ ok: true });
  },
  { rateLimit: 'passwordReset' },
);
