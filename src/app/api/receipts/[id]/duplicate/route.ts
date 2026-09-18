import { FileKind } from '@prisma/client';
import { NextResponse } from 'next/server';
import { notFound, withWorkspace } from '@/lib/api';
import { recordAudit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { buildStorageKey, getStorage } from '@/lib/storage';

export const runtime = 'nodejs';

/**
 * Makes an independent copy of a slip.
 *
 * The stored objects are copied too, rather than shared, so deleting either
 * slip can never remove the other's document.
 */
export const POST = withWorkspace<{ id: string }>(async ({ request, session, params }) => {
  const source = await prisma.receipt.findFirst({
    where: { id: params.id, businessId: session.businessId, deletedAt: null },
    include: { files: true, lineItems: true, tags: true },
  });
  if (!source) return notFound('That slip');

  const storage = getStorage();
  const copiedFiles: Array<{ original: (typeof source.files)[number]; newKey: string }> = [];

  for (const file of source.files) {
    try {
      const buffer = await storage.get(file.storageKey);
      const newKey = buildStorageKey({
        businessId: session.businessId,
        scope: file.kind === FileKind.ORIGINAL ? 'receipts' : file.kind === FileKind.PREVIEW ? 'previews' : 'thumbnails',
        mimeType: file.mimeType,
      });
      await storage.put({ key: newKey, body: buffer, contentType: file.mimeType });
      copiedFiles.push({ original: file, newKey });
    } catch {
      // Skip a page we cannot read rather than failing the whole copy.
    }
  }

  const copy = await prisma.$transaction(async (tx) => {
    const created = await tx.receipt.create({
      data: {
        businessId: session.businessId,
        uploadedByUserId: session.userId,
        folderId: source.folderId,
        categoryId: source.categoryId,
        status: source.status,
        documentType: source.documentType,
        merchantName: source.merchantName,
        receiptNumber: source.receiptNumber,
        purchaseDate: source.purchaseDate,
        purchaseTime: source.purchaseTime,
        currency: source.currency,
        subtotalCents: source.subtotalCents,
        taxCents: source.taxCents,
        totalCents: source.totalCents,
        paymentMethod: source.paymentMethod,
        note: source.note,
        fileHash: source.fileHash,
        duplicateOfId: source.id,
      },
      select: { id: true },
    });

    for (const { original, newKey } of copiedFiles) {
      await tx.receiptFile.create({
        data: {
          receiptId: created.id,
          businessId: session.businessId,
          kind: original.kind,
          storageKey: newKey,
          originalFilename: original.originalFilename,
          mimeType: original.mimeType,
          sizeBytes: original.sizeBytes,
          sha256: original.sha256,
          pageNumber: original.pageNumber,
          width: original.width,
          height: original.height,
        },
      });
    }

    if (source.lineItems.length) {
      await tx.receiptLineItem.createMany({
        data: source.lineItems.map((item) => ({
          receiptId: created.id,
          position: item.position,
          description: item.description,
          quantity: item.quantity,
          unitCents: item.unitCents,
          totalCents: item.totalCents,
        })),
      });
    }

    if (source.tags.length) {
      await tx.receiptTag.createMany({
        data: source.tags.map((link) => ({ receiptId: created.id, tagId: link.tagId })),
      });
    }

    return created;
  });

  await recordAudit({
    action: 'receipt.duplicated',
    entityType: 'receipt',
    entityId: copy.id,
    businessId: session.businessId,
    userId: session.userId,
    metadata: { copiedFrom: source.id },
    request,
  });

  return NextResponse.json({ receiptId: copy.id }, { status: 201 });
});
