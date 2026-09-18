import { NextResponse } from 'next/server';
import { getAdminSession, signOutAdmin } from '@/lib/admin/auth';
import { withPublicRoute } from '@/lib/api';
import { recordAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withPublicRoute(async ({ request }) => {
  const session = await getAdminSession();
  signOutAdmin();

  if (session) {
    await recordAudit({
      action: 'user.logout',
      entityType: 'admin-user',
      entityId: session.adminId,
      metadata: { portal: 'admin' },
      request,
    });
  }

  return NextResponse.json({ ok: true });
});
