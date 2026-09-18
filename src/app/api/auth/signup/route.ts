import { NextResponse } from 'next/server';
import { createAccount, EmailTakenError, sendVerificationEmail } from '@/lib/accounts';
import { HttpError, parseJson, withPublicRoute } from '@/lib/api';
import { recordAudit } from '@/lib/audit';
import { signupSchema } from '@/lib/validation';

export const runtime = 'nodejs';

export const POST = withPublicRoute(
  async ({ request }) => {
    const data = await parseJson(request, signupSchema);

    let account: { userId: string; businessId: string };
    try {
      account = await createAccount({
        firstName: data.firstName,
        businessName: data.businessName,
        phone: data.phone,
        email: data.email,
        password: data.password,
      });
    } catch (error) {
      if (error instanceof EmailTakenError) {
        throw new HttpError(409, 'An account with that e-mail address already exists.', 'email_taken', {
          email: 'That e-mail address is already registered. Try signing in instead.',
        });
      }
      throw error;
    }

    // Verification is best-effort: a mail failure must not block the signup.
    await sendVerificationEmail(account.userId).catch(() => undefined);

    await recordAudit({
      action: 'user.signup',
      entityType: 'user',
      entityId: account.userId,
      businessId: account.businessId,
      userId: account.userId,
      request,
    });

    await recordAudit({
      action: 'business.created',
      entityType: 'business',
      entityId: account.businessId,
      businessId: account.businessId,
      userId: account.userId,
      request,
    });

    return NextResponse.json({ ok: true, userId: account.userId }, { status: 201 });
  },
  { rateLimit: 'signup' },
);
