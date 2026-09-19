import { Readable } from 'node:stream';
import { ExportStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import { forbidden, notFound, unauthorized } from '@/lib/api';
import { recordAudit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { getWorkspaceSession } from '@/lib/session';
import { getStorage } from '@/lib/storage';
import { verifyFileToken } from '@/lib/storage/signing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Streams a finished export archive to its owner. Same triple check as documents. */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token');
  if (!token) return notFound('That export');

  const grant = await verifyFileToken(token);
  if (!grant || grant.resourceType !== 'export') return notFound('That export');

  const session = await getWorkspaceSession();
  if (!session) return unauthorized();
  if (session.businessId !== grant.businessId) return forbidden();

  const job = await prisma.exportJob.findFirst({
    where: { id: grant.resourceId, businessId: session.businessId },
    select: { id: true, status: true, storageKey: true, sizeBytes: true, label: true, expiresAt: true },
  });

  if (!job || !job.storageKey || job.status !== ExportStatus.READY) return notFound('That export');
  if (job.expiresAt && job.expiresAt < new Date()) {
    return NextResponse.json({ error: 'That export has expired. Create a new one.', code: 'expired' }, { status: 410 });
  }

  const storage = getStorage();
  const filename = (grant.downloadFilename ?? `${job.label ?? 'slipsy-export'}.zip`).replace(/["\\\r\n]/g, '');

  const presigned = await storage.presignedUrl(job.storageKey, 120, filename);
  if (presigned) return NextResponse.redirect(presigned, { status: 307, headers: { 'Cache-Control': 'private, no-store' } });

  let stream: NodeJS.ReadableStream;
  try {
    stream = await storage.getStream(job.storageKey);
  } catch {
    return notFound('That export');
  }

  await recordAudit({
    action: 'export.downloaded',
    entityType: 'export',
    entityId: job.id,
    businessId: session.businessId,
    userId: session.userId,
    request,
  });

  const headers = new Headers({
    'Content-Type': 'application/zip',
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `attachment; filename="${filename}"`,
  });
  if (job.sizeBytes > 0) headers.set('Content-Length', String(job.sizeBytes));

  return new NextResponse(Readable.toWeb(Readable.from(stream)) as unknown as ReadableStream, { headers });
}
