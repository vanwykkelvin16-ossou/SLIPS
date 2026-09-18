import { NextResponse } from 'next/server';
import { z } from 'zod';
import { changeAdminPassword, getAdminSession } from '@/lib/admin/auth';
import { HttpError, parseJson, unauthorized, withPublicRoute } from '@/lib/api';
import { recordAudit } from '@/lib/audit';
import { passwordSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const changeSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Both passwords must match',
    path: ['confirmPassword'],
  })
  .refine((data) => data.password !== data.currentPassword, {
    message: 'Choose a password you have not used here before',
    path: ['password'],
  });

export const POST = withPublicRoute(
  async ({ request }) => {
    const session = await getAdminSession();
    if (!session) return unauthorized();

    const data = await parseJson(request, changeSchema);
    const changed = await changeAdminPassword(session.adminId, data.currentPassword, data.password);

    if (!changed) {
      throw new HttpError(422, 'That is not your current password.', 'invalid_password', {
        currentPassword: 'That is not your current password.',
      });
    }

    await recordAudit({
      action: 'user.password_changed',
      entityType: 'admin-user',
      entityId: session.adminId,
      metadata: { portal: 'admin' },
      request,
    });

    // The session was invalidated, so the admin signs in again with the new password.
    return NextResponse.json({ ok: true, signOutRequired: true });
  },
  { rateLimit: 'passwordReset' },
);
