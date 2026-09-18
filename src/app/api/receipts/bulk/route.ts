import { NextResponse } from 'next/server';
import { z } from 'zod';
import { HttpError, parseJson, withWorkspace } from '@/lib/api';
import { recordAudit } from '@/lib/audit';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bulkSchema = z.object({
  receiptIds: z.array(z.string().cuid()).min(1, 'Select at least one slip').max(500),
  action: z.enum(['delete', 'restore', 'move']),
  folderId: z.string().cuid().nullable().optional(),
});

export const POST = withWorkspace(async ({ request, session }) => {
  const { receiptIds, action, folderId } = await parseJson(request, bulkSchema);

  // Only ids that genuinely belong to this workspace are ever touched.
  const owned = await prisma.receipt.findMany({
    where: { id: { in: receiptIds }, businessId: session.businessId },
    select: { id: true },
  });
  const ownedIds = owned.map((row) => row.id);
  if (ownedIds.length === 0) throw new HttpError(404, 'Those slips could not be found.', 'not_found');

  if (action === 'move') {
    if (folderId) {
      const folder = await prisma.folder.findFirst({
        where: { id: folderId, businessId: session.businessId },
        select: { id: true },
      });
      if (!folder) throw new HttpError(422, 'That folder is not available.', 'invalid_folder');
    }

    await prisma.receipt.updateMany({
      where: { id: { in: ownedIds }, businessId: session.businessId },
      data: { folderId: folderId ?? null },
    });

    await recordAudit({
      action: 'receipt.moved',
      entityType: 'receipt',
      businessId: session.businessId,
      userId: session.userId,
      metadata: { count: ownedIds.length, folderId: folderId ?? null },
      request,
    });

    return NextResponse.json({ ok: true, count: ownedIds.length });
  }

  const deletedAt = action === 'delete' ? new Date() : null;
  await prisma.receipt.updateMany({
    where: { id: { in: ownedIds }, businessId: session.businessId },
    data: { deletedAt },
  });

  await recordAudit({
    action: action === 'delete' ? 'receipt.deleted' : 'receipt.restored',
    entityType: 'receipt',
    businessId: session.businessId,
    userId: session.userId,
    metadata: { count: ownedIds.length, bulk: true },
    request,
  });

  return NextResponse.json({
    ok: true,
    count: ownedIds.length,
    receiptIds: ownedIds,
    ...(action === 'delete' ? { undoUntil: new Date(Date.now() + 30_000).toISOString() } : {}),
  });
});
