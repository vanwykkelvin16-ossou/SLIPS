import { FolderKind, Prisma, ReceiptStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import { HttpError, notFound, parseJson, withWorkspace } from '@/lib/api';
import { recordAudit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { ensureDateFolder } from '@/lib/folders';
import { parseAmountToCents } from '@/lib/money';
import { findDuplicates } from '@/lib/receipts/duplicates';
import { fromDateInput, getReceiptDetail } from '@/lib/receipts/service';
import { receiptUpdateSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withWorkspace<{ id: string }>(async ({ session, params }) => {
  const receipt = await getReceiptDetail(session.businessId, params.id);
  if (!receipt) return notFound('That slip');
  return NextResponse.json({ receipt });
});

export const PATCH = withWorkspace<{ id: string }>(async ({ request, session, params }) => {
  const data = await parseJson(request, receiptUpdateSchema);

  const existing = await prisma.receipt.findFirst({
    where: { id: params.id, businessId: session.businessId, deletedAt: null },
    select: { id: true, currency: true, status: true, fileHash: true, folderId: true },
  });
  if (!existing) return notFound('That slip');

  const currency = data.currency ?? existing.currency;
  const existingFolderId = existing.folderId;

  // Every referenced folder and category must belong to this workspace.
  if (data.folderId) {
    const folder = await prisma.folder.findFirst({
      where: { id: data.folderId, businessId: session.businessId },
      select: { id: true },
    });
    if (!folder) throw new HttpError(422, 'That folder is not available.', 'invalid_folder', { folderId: 'Choose a folder from the list.' });
  }

  let categoryName: string | null = null;
  if (data.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: data.categoryId, businessId: session.businessId },
      select: { id: true, name: true },
    });
    if (!category) {
      throw new HttpError(422, 'That category is not available.', 'invalid_category', {
        categoryId: 'Choose a category from the list.',
      });
    }
    categoryName = category.name;
  }

  const purchaseDate =
    data.purchaseDate === undefined ? undefined : data.purchaseDate === null ? null : fromDateInput(data.purchaseDate);

  const update: Prisma.ReceiptUpdateInput = {
    ...(data.merchantName !== undefined ? { merchantName: data.merchantName || null } : {}),
    ...(data.receiptNumber !== undefined ? { receiptNumber: data.receiptNumber || null } : {}),
    ...(purchaseDate !== undefined ? { purchaseDate } : {}),
    ...(data.purchaseTime !== undefined ? { purchaseTime: data.purchaseTime || null } : {}),
    ...(data.currency ? { currency: data.currency } : {}),
    ...(data.subtotal !== undefined ? { subtotalCents: parseAmountToCents(data.subtotal, currency) } : {}),
    ...(data.tax !== undefined ? { taxCents: parseAmountToCents(data.tax, currency) } : {}),
    ...(data.total !== undefined ? { totalCents: parseAmountToCents(data.total, currency) } : {}),
    ...(data.paymentMethod ? { paymentMethod: data.paymentMethod } : {}),
    ...(data.documentType ? { documentType: data.documentType } : {}),
    ...(data.note !== undefined ? { note: data.note || null } : {}),
    ...(data.categoryId !== undefined
      ? { category: data.categoryId ? { connect: { id: data.categoryId } } : { disconnect: true } }
      : {}),
  };

  /*
   * Filing by date. A slip being filed that is still sitting in a holding
   * folder — or has no folder at all — is moved to its year/month folder, so
   * "Unfiled" and "Needs review" never become permanent homes. A folder the
   * user actually picked is always respected.
   */
  let folderId = data.folderId;
  if (data.status === 'FILED' && purchaseDate) {
    const chosenId = folderId === undefined ? existingFolderId : folderId;
    const chosen = chosenId
      ? await prisma.folder.findFirst({ where: { id: chosenId, businessId: session.businessId }, select: { kind: true } })
      : null;
    const isHoldingFolder = !chosen || chosen.kind === FolderKind.UNFILED || chosen.kind === FolderKind.NEEDS_REVIEW;

    if (isHoldingFolder) {
      folderId = await ensureDateFolder(session.businessId, purchaseDate, session.folderStructure, categoryName);
    }
  }
  if (folderId !== undefined) {
    update.folder = folderId ? { connect: { id: folderId } } : { disconnect: true };
  }

  if (data.status) {
    update.status = data.status === 'FILED' ? ReceiptStatus.FILED : ReceiptStatus.NEEDS_REVIEW;
    if (data.status === 'FILED') update.reviewedAt = new Date();
  }

  await prisma.$transaction(async (tx) => {
    await tx.receipt.update({ where: { id: params.id }, data: update });

    if (data.tags) {
      const names = [...new Set(data.tags.map((tag) => tag.trim()).filter(Boolean))];
      const tagIds: string[] = [];
      for (const name of names) {
        const tag = await tx.tag.upsert({
          where: { businessId_name: { businessId: session.businessId, name } },
          create: { businessId: session.businessId, name },
          update: {},
          select: { id: true },
        });
        tagIds.push(tag.id);
      }
      await tx.receiptTag.deleteMany({ where: { receiptId: params.id, tagId: { notIn: tagIds.length ? tagIds : ['none'] } } });
      for (const tagId of tagIds) {
        await tx.receiptTag.upsert({
          where: { receiptId_tagId: { receiptId: params.id, tagId } },
          create: { receiptId: params.id, tagId },
          update: {},
        });
      }
    }

    if (data.lineItems) {
      await tx.receiptLineItem.deleteMany({ where: { receiptId: params.id } });
      if (data.lineItems.length) {
        await tx.receiptLineItem.createMany({
          data: data.lineItems.map((item, index) => ({
            receiptId: params.id,
            position: index,
            description: item.description,
            quantity:
              item.quantity === null || item.quantity === undefined || item.quantity === ''
                ? null
                : new Prisma.Decimal(Number(item.quantity).toFixed(3)),
            unitCents: parseAmountToCents(item.unit ?? null, currency),
            totalCents: parseAmountToCents(item.total ?? null, currency),
          })),
        });
      }
    }
  });

  await recordAudit({
    action: 'receipt.updated',
    entityType: 'receipt',
    entityId: params.id,
    businessId: session.businessId,
    userId: session.userId,
    metadata: { fields: Object.keys(data).join(','), filed: data.status === 'FILED' },
    request,
  });

  const receipt = await getReceiptDetail(session.businessId, params.id);
  return NextResponse.json({ receipt });
});

/** Soft delete, so an accidental tap can be undone. */
export const DELETE = withWorkspace<{ id: string }>(async ({ request, session, params }) => {
  const existing = await prisma.receipt.findFirst({
    where: { id: params.id, businessId: session.businessId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) return notFound('That slip');

  await prisma.receipt.update({ where: { id: params.id }, data: { deletedAt: new Date() } });

  await recordAudit({
    action: 'receipt.deleted',
    entityType: 'receipt',
    entityId: params.id,
    businessId: session.businessId,
    userId: session.userId,
    request,
  });

  return NextResponse.json({ ok: true, undoUntil: new Date(Date.now() + 30_000).toISOString() });
});

/** Restores a soft-deleted slip, or re-checks for duplicates. */
export const PUT = withWorkspace<{ id: string }>(async ({ request, session, params }) => {
  const action = new URL(request.url).searchParams.get('action');

  if (action === 'restore') {
    const existing = await prisma.receipt.findFirst({
      where: { id: params.id, businessId: session.businessId, deletedAt: { not: null } },
      select: { id: true },
    });
    if (!existing) return notFound('That slip');

    await prisma.receipt.update({ where: { id: params.id }, data: { deletedAt: null } });
    await recordAudit({
      action: 'receipt.restored',
      entityType: 'receipt',
      entityId: params.id,
      businessId: session.businessId,
      userId: session.userId,
      request,
    });
    return NextResponse.json({ ok: true });
  }

  if (action === 'check-duplicates') {
    const receipt = await prisma.receipt.findFirst({
      where: { id: params.id, businessId: session.businessId, deletedAt: null },
      select: { fileHash: true, merchantName: true, purchaseDate: true, totalCents: true, receiptNumber: true },
    });
    if (!receipt) return notFound('That slip');

    const duplicates = await findDuplicates({
      businessId: session.businessId,
      fileHash: receipt.fileHash,
      merchantName: receipt.merchantName,
      purchaseDate: receipt.purchaseDate,
      totalCents: receipt.totalCents,
      receiptNumber: receipt.receiptNumber,
      excludeReceiptId: params.id,
    });
    return NextResponse.json({ duplicates });
  }

  throw new HttpError(400, 'Unknown action.', 'unknown_action');
});
