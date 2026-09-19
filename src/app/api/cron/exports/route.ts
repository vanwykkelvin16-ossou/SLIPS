import { NextResponse } from 'next/server';
import { expireOldExports, processPendingExports } from '@/lib/export/queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Drives the export queue on hosts that stop executing a function as soon as
 * it has responded, where `startExportJob` cannot finish in the background.
 * Vercel Cron calls this on a schedule (see vercel.json); any scheduler that
 * can send the bearer token works just as well.
 *
 * On a long-running Node server this endpoint is harmless but unnecessary —
 * `npm run worker:exports` does the same work continuously.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  /*
   * Without a secret this would let anyone drive the queue, so it stays shut.
   * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically.
   */
  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured, so the export cron endpoint is disabled.' },
      { status: 503 },
    );
  }

  const presented = request.headers.get('authorization');
  if (presented !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 401 });
  }

  try {
    const processed = await processPendingExports();
    const expired = await expireOldExports();
    return NextResponse.json({ processed, expired });
  } catch (error) {
    // The message is deliberately generic; details go to the server log only.
    // eslint-disable-next-line no-console
    console.error('[export-cron] run failed', (error as Error).message);
    return NextResponse.json({ error: 'The export run failed.' }, { status: 500 });
  }
}
