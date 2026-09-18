import { FileKind } from '@prisma/client';
import { NextResponse } from 'next/server';
import { notFound, withWorkspace } from '@/lib/api';
import { recordAudit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { receiptFilename } from '@/lib/export/filenames';
import { buildReceiptPdf } from '@/lib/export/receipt-pdf';
import { getStorage } from '@/lib/storage';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** One slip as a tidy PDF: extracted details first, original document after. */
export const GET = withWorkspace<{ id: string }>(async ({ request, session, params }) => {
  const receipt = await prisma.receipt.findFirst({
    where: { id: params.id, businessId: session.businessId, deletedAt: null },
    include: {
      files: { where: { kind: FileKind.ORIGINAL }, orderBy: { pageNumber: 'asc' } },
      category: { select: { name: true } },
      folder: { select: { name: true } },
      tags: { include: { tag: { select: { name: true } } } },
      lineItems: { orderBy: { position: 'asc' } },
    },
  });

  if (!receipt) return notFound('That slip');

  const storage = getStorage();
  const pages: Array<{ buffer: Buffer; mimeType: string }> = [];
  for (const file of receipt.files) {
    try {
      pages.push({ buffer: await storage.get(file.storageKey), mimeType: file.mimeType });
    } catch {
      // Keep going: the details page is still worth producing.
    }
  }

  const pdf = await buildReceiptPdf({
    businessName: session.businessName,
    merchantName: receipt.merchantName,
    receiptNumber: receipt.receiptNumber,
    purchaseDate: receipt.purchaseDate,
    purchaseTime: receipt.purchaseTime,
    currency: receipt.currency,
    subtotalCents: receipt.subtotalCents,
    taxCents: receipt.taxCents,
    totalCents: receipt.totalCents,
    paymentMethod: receipt.paymentMethod,
    documentType: receipt.documentType,
    categoryName: receipt.category?.name ?? null,
    folderName: receipt.folder?.name ?? null,
    note: receipt.note,
    tags: receipt.tags.map((link) => link.tag.name),
    lineItems: receipt.lineItems.map((item) => ({
      description: item.description,
      quantity: item.quantity ? item.quantity.toString() : null,
      unitCents: item.unitCents,
      totalCents: item.totalCents,
    })),
    uploadedAt: receipt.createdAt,
    updatedAt: receipt.updatedAt,
    pages,
  });

  const filename = receiptFilename({
    purchaseDate: receipt.purchaseDate,
    createdAt: receipt.createdAt,
    merchantName: receipt.merchantName,
    totalCents: receipt.totalCents,
    currency: receipt.currency,
    receiptNumber: receipt.receiptNumber,
    extension: 'pdf',
  });

  await recordAudit({
    action: 'receipt.downloaded',
    entityType: 'receipt',
    entityId: receipt.id,
    businessId: session.businessId,
    userId: session.userId,
    metadata: { format: 'pdf' },
    request,
  });

  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
