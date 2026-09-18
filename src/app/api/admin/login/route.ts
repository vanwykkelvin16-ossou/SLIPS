import { NextResponse } from 'next/server';
import { z } from 'zod';
import { signInAdmin } from '@/lib/admin/auth';
import { jsonError, parseJson, withPublicRoute } from '@/lib/api';
import { recordAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Enter your e-mail address').max(254).email('Enter a valid e-mail address'),
  password: z.string().min(1, 'Enter your password'),
});

export const POST = withPublicRoute(
  async ({ request }) => {
    const { email, password } = await parseJson(request, loginSchema);
    const result = await signInAdmin(email, password);

    if (!result.ok) {
      await recordAudit({
        action: 'user.login_failed',
        entityType: 'admin-user',
        metadata: { portal: 'admin', reason: result.reason },
        request,
      });

      if (result.reason === 'locked') {
        return jsonError(
          'Too many failed attempts. This account is locked for 15 minutes.',
          423,
          'locked',
        );
      }
      if (result.reason === 'disabled') {
        return jsonError('That administrator account is not active.', 403, 'disabled');
      }
      // Wrong password and unknown address give the same answer.
      return jsonError('Those sign-in details are not correct.', 401, 'invalid_credentials');
    }

    await recordAudit({
      action: 'user.login',
      entityType: 'admin-user',
      entityId: result.session.adminId,
      metadata: { portal: 'admin' },
      request,
    });

    return NextResponse.json({
      ok: true,
      mustChangePassword: result.session.mustChangePassword,
    });
  },
  { rateLimit: 'login' },
);
