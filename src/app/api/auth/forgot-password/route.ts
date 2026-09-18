import { NextResponse } from 'next/server';
import { parseJson, withPublicRoute } from '@/lib/api';
import { recordAudit } from '@/lib/audit';
import { createToken, RESET_TOKEN_TTL_MS } from '@/lib/auth-tokens';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { passwordResetEmail } from '@/lib/email/templates';
import { getAppUrl } from '@/lib/env';
import { forgotPasswordSchema } from '@/lib/validation';

export const runtime = 'nodejs';

export const POST = withPublicRoute(
  async ({ request }) => {
    const { email } = await parseJson(request, forgotPasswordSchema);

    const user = await prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: { id: true, email: true, firstName: true },
    });

    if (user) {
      const { token, tokenHash } = createToken();

      await prisma.$transaction([
        // Any earlier link becomes unusable the moment a new one is requested.
        prisma.passwordResetToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: new Date() },
        }),
        prisma.passwordResetToken.create({
          data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
        }),
      ]);

      const url = `${getAppUrl()}/reset-password?token=${encodeURIComponent(token)}`;
      await sendEmail(passwordResetEmail(user.email, user.firstName, url)).catch(() => undefined);

      await recordAudit({
        action: 'user.password_reset_requested',
        entityType: 'user',
        entityId: user.id,
        userId: user.id,
        request,
      });
    }

    // Always the same answer, so the endpoint cannot be used to discover
    // which e-mail addresses have accounts.
    return NextResponse.json({
      ok: true,
      message: 'If that e-mail address has an account, a reset link is on its way.',
    });
  },
  { rateLimit: 'passwordReset' },
);
