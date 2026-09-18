import { NextResponse } from 'next/server';
import { withWorkspace } from '@/lib/api';
import { recordAudit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { centsToInputValue } from '@/lib/money';

export const runtime = 'nodejs';

/**
 * "Export all my data" — the structured record of everything held about the
 * account and its slips, as JSON. The documents themselves are downloaded
 * through the export centre, which packs the original files into a ZIP.
 */
export const GET = withWorkspace(
  async ({ request, session }) => {
    const [user, business, receipts, folders, categories, tags, exportJobs, auditLogs] = await Promise.all([
      prisma.user.findUnique({
        where: { id: session.userId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          emailVerifiedAt: true,
          termsAcceptedAt: true,
          notifyByEmail: true,
          notifyOnExport: true,
          notifyMonthly: true,
          createdAt: true,
          lastLoginAt: true,
        },
      }),
      prisma.business.findUnique({
        where: { id: session.businessId },
        select: {
          id: true,
          name: true,
          currency: true,
          financialYearStartMonth: true,
          folderStructure: true,
          phone: true,
          vatNumber: true,
          addressLine: true,
          createdAt: true,
        },
      }),
      prisma.receipt.findMany({
        where: { businessId: session.businessId },
        orderBy: { createdAt: 'asc' },
        include: {
          files: { select: { originalFilename: true, mimeType: true, sizeBytes: true, sha256: true, pageNumber: true, kind: true } },
          lineItems: { select: { description: true, quantity: true, unitCents: true, totalCents: true, position: true } },
          tags: { include: { tag: { select: { name: true } } } },
          category: { select: { name: true } },
          folder: { select: { name: true } },
        },
      }),
      prisma.folder.findMany({
        where: { businessId: session.businessId },
        select: { id: true, name: true, kind: true, parentId: true, color: true, archivedAt: true, createdAt: true },
      }),
      prisma.category.findMany({
        where: { businessId: session.businessId },
        select: { name: true, color: true, isDefault: true, archivedAt: true },
      }),
      prisma.tag.findMany({ where: { businessId: session.businessId }, select: { name: true, createdAt: true } }),
      prisma.exportJob.findMany({
        where: { businessId: session.businessId },
        select: { id: true, type: true, status: true, fileCount: true, createdAt: true, completedAt: true },
      }),
      prisma.auditLog.findMany({
        where: { businessId: session.businessId },
        orderBy: { createdAt: 'desc' },
        take: 1000,
        select: { action: true, entityType: true, entityId: true, createdAt: true },
      }),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      format: 'slipsy-account-export-v1',
      user,
      business,
      folders,
      categories,
      tags,
      receipts: receipts.map((receipt) => ({
        id: receipt.id,
        merchantName: receipt.merchantName,
        receiptNumber: receipt.receiptNumber,
        purchaseDate: receipt.purchaseDate,
        purchaseTime: receipt.purchaseTime,
        currency: receipt.currency,
        subtotal: receipt.subtotalCents !== null ? centsToInputValue(receipt.subtotalCents, receipt.currency) : null,
        tax: receipt.taxCents !== null ? centsToInputValue(receipt.taxCents, receipt.currency) : null,
        total: receipt.totalCents !== null ? centsToInputValue(receipt.totalCents, receipt.currency) : null,
        paymentMethod: receipt.paymentMethod,
        documentType: receipt.documentType,
        status: receipt.status,
        note: receipt.note,
        category: receipt.category?.name ?? null,
        folder: receipt.folder?.name ?? null,
        tags: receipt.tags.map((link) => link.tag.name),
        lineItems: receipt.lineItems,
        files: receipt.files,
        createdAt: receipt.createdAt,
        updatedAt: receipt.updatedAt,
        deletedAt: receipt.deletedAt,
      })),
      exportJobs,
      recentActivity: auditLogs,
    };

    await recordAudit({
      action: 'export.requested',
      entityType: 'account-data',
      entityId: session.userId,
      businessId: session.businessId,
      userId: session.userId,
      metadata: { receipts: receipts.length },
      request,
    });

    const filename = `slipsy-account-data-${new Date().toISOString().slice(0, 10)}.json`;

    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store, max-age=0',
      },
    });
  },
  { rateLimit: 'export' },
);
