import { NextResponse } from 'next/server';
import { hashPassword } from '@/lib/accounts';
import { HttpError, parseJson, withPublicRoute } from '@/lib/api';
import { recordAudit } from '@/lib/audit';
import { hashToken } from '@/lib/auth-tokens';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { passwordChangedEmail } from '@/lib/email/templates';
import { resetPasswordSchema } from '@/lib/validation';

export const runtime = 'nodejs';

export const POST = withPublicRoute(
  async ({ request }) => {
    const { token, password } = await parseJson(request, resetPasswordSchema);

    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { select: { id: true, email: true, firstName: true, deletedAt: true } } },
    });

    if (!record || record.usedAt || record.expiresAt < new Date() || record.user.deletedAt) {
      throw new HttpError(400, 'That reset link has expired or has already been used.', 'invalid_token');
    }

    const passwordHash = await hashPassword(password);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: {
          passwordHash,
          failedLogins: 0,
          lockedUntil: null,
          // Signs out every existing session on every device.
          sessionVersion: { increment: 1 },
        },
      }),
      prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      prisma.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);

    await sendEmail(passwordChangedEmail(record.user.email, record.user.firstName)).catch(() => undefined);

    await recordAudit({
      action: 'user.password_reset_completed',
      entityType: 'user',
      entityId: record.userId,
      userId: record.userId,
      request,
    });

    return NextResponse.json({ ok: true });
  },
  { rateLimit: 'passwordReset' },
);
