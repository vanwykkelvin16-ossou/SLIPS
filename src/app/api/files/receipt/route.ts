import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';
import { forbidden, notFound, unauthorized } from '@/lib/api';
import { recordAudit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { getWorkspaceSession } from '@/lib/session';
import { getStorage } from '@/lib/storage';
import { verifyFileToken } from '@/lib/storage/signing';

export const runtime = 'nodejs';

/**
 * Serves a stored document.
 *
 * Three independent checks must all pass: a valid, unexpired signed token, an
 * authenticated session, and a file row whose business matches both. A token
 * that leaks is therefore useless to anyone outside the workspace, and a
 * signed-in user cannot read another business's documents by guessing ids.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!token) return notFound('That document');

  const grant = await verifyFileToken(token);
  if (!grant || grant.resourceType !== 'receipt-file') return notFound('That document');

  const session = await getWorkspaceSession();
  if (!session) return unauthorized();
  if (session.businessId !== grant.businessId) {
    await recordAudit({
      action: 'access.denied',
      entityType: 'receipt-file',
      entityId: grant.resourceId,
      businessId: session.businessId,
      userId: session.userId,
      metadata: { reason: 'business-mismatch' },
      request,
    });
    return forbidden();
  }

  const file = await prisma.receiptFile.findFirst({
    where: { id: grant.resourceId, businessId: session.businessId },
    select: {
      id: true,
      storageKey: true,
      mimeType: true,
      originalFilename: true,
      sizeBytes: true,
      receipt: { select: { id: true, deletedAt: true } },
    },
  });

  if (!file) return notFound('That document');

  const storage = getStorage();

  // Where the driver supports pre-signing (S3/R2), hand the client a direct,
  // short-lived URL instead of proxying the bytes through the application.
  const presigned = await storage.presignedUrl(file.storageKey, 120, grant.downloadFilename);
  if (presigned) {
    return NextResponse.redirect(presigned, { status: 307 });
  }

  let stream: NodeJS.ReadableStream;
  try {
    stream = await storage.getStream(file.storageKey);
  } catch {
    return notFound('That document');
  }

  const headers = new Headers({
    'Content-Type': file.mimeType,
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': grant.downloadFilename
      ? `attachment; filename="${grant.downloadFilename.replace(/["\\\r\n]/g, '')}"`
      : `inline; filename="${file.originalFilename.replace(/["\\\r\n]/g, '')}"`,
  });
  if (file.sizeBytes > 0) headers.set('Content-Length', String(file.sizeBytes));

  if (grant.downloadFilename) {
    await recordAudit({
      action: 'receipt.downloaded',
      entityType: 'receipt',
      entityId: file.receipt.id,
      businessId: session.businessId,
      userId: session.userId,
      metadata: { fileId: file.id },
      request,
    });
  }

  return new NextResponse(Readable.toWeb(Readable.from(stream)) as unknown as ReadableStream, { headers });
}
