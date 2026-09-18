import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin/auth';
import { directoryQuerySchema, getDirectoryStats, listRegisteredUsers } from '@/lib/admin/directory';
import { parseQuery, unauthorized, withPublicRoute } from '@/lib/api';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The directory feed behind the admin dashboard's live search.
 *
 * Authorisation is checked here on the server for every request — the
 * middleware redirect in front of /admin is a convenience, not the control.
 */
export const GET = withPublicRoute(async ({ request }) => {
  const session = await getAdminSession();
  if (!session) return unauthorized();

  const limit = await checkRateLimit('read', `admin:${session.adminId}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.', code: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const query = parseQuery(request, directoryQuerySchema);
  const [result, stats] = await Promise.all([listRegisteredUsers(query), getDirectoryStats()]);

  return NextResponse.json(
    { ...result, stats },
    { headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
  );
});
