import { FileKind, ReceiptStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { financialYearRange } from '@/lib/folders';
import { signedFileUrl } from '@/lib/storage/signing';

export interface DashboardReceipt {
  id: string;
  merchantName: string | null;
  purchaseDate: Date | null;
  totalCents: number | null;
  currency: string;
  status: ReceiptStatus;
  categoryName: string | null;
  folderName: string | null;
  thumbnailUrl: string | null;
}

export interface DashboardFolder {
  id: string;
  name: string;
  parentName: string | null;
  color: string | null;
  count: number;
  lastUsedAt: Date;
}

export interface DashboardData {
  totalSlips: number;
  slipsThisMonth: number;
  totalSpendCents: number;
  financialYearSpendCents: number;
  needsReview: number;
  recentReceipts: DashboardReceipt[];
  recentFolders: DashboardFolder[];
  hasAnySlip: boolean;
}

/** Everything the dashboard shows, in as few round trips as practical. */
export async function getDashboardData(businessId: string, financialYearStartMonth: number): Promise<DashboardData> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const fy = financialYearRange(now, financialYearStartMonth);

  const [totalSlips, slipsThisMonth, spendAggregate, fyAggregate, needsReview, recentRows, recentFolderRows] =
    await Promise.all([
      prisma.receipt.count({ where: { businessId, deletedAt: null } }),
      prisma.receipt.count({ where: { businessId, deletedAt: null, createdAt: { gte: monthStart } } }),
      prisma.receipt.aggregate({ where: { businessId, deletedAt: null }, _sum: { totalCents: true } }),
      prisma.receipt.aggregate({
        where: { businessId, deletedAt: null, purchaseDate: { gte: fy.start, lte: fy.end } },
        _sum: { totalCents: true },
      }),
      prisma.receipt.count({ where: { businessId, deletedAt: null, status: ReceiptStatus.NEEDS_REVIEW } }),
      prisma.receipt.findMany({
        where: { businessId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: {
          id: true,
          merchantName: true,
          purchaseDate: true,
          totalCents: true,
          currency: true,
          status: true,
          category: { select: { name: true } },
          folder: { select: { name: true } },
          files: {
            where: { kind: FileKind.THUMBNAIL },
            orderBy: { pageNumber: 'asc' },
            take: 1,
            select: { id: true },
          },
        },
      }),
      prisma.receipt.groupBy({
        by: ['folderId'],
        where: { businessId, deletedAt: null, folderId: { not: null } },
        _count: { _all: true },
        _max: { updatedAt: true },
        orderBy: { _max: { updatedAt: 'desc' } },
        take: 4,
      }),
    ]);

  const folderIds = recentFolderRows.map((row) => row.folderId).filter((id): id is string => Boolean(id));
  const folders = folderIds.length
    ? await prisma.folder.findMany({
        where: { id: { in: folderIds }, businessId },
        select: { id: true, name: true, color: true, parent: { select: { name: true } } },
      })
    : [];
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));

  const recentReceipts: DashboardReceipt[] = await Promise.all(
    recentRows.map(async (row) => ({
      id: row.id,
      merchantName: row.merchantName,
      purchaseDate: row.purchaseDate,
      totalCents: row.totalCents,
      currency: row.currency,
      status: row.status,
      categoryName: row.category?.name ?? null,
      folderName: row.folder?.name ?? null,
      thumbnailUrl: row.files[0]
        ? await signedFileUrl({ resourceId: row.files[0].id, resourceType: 'receipt-file', businessId }, 900)
        : null,
    })),
  );

  const recentFolders: DashboardFolder[] = recentFolderRows
    .map((row) => {
      const folder = row.folderId ? folderById.get(row.folderId) : undefined;
      if (!folder) return null;
      return {
        id: folder.id,
        name: folder.name,
        parentName: folder.parent?.name ?? null,
        color: folder.color,
        count: row._count._all,
        lastUsedAt: row._max.updatedAt ?? new Date(),
      };
    })
    .filter((folder): folder is DashboardFolder => folder !== null);

  return {
    totalSlips,
    slipsThisMonth,
    totalSpendCents: spendAggregate._sum.totalCents ?? 0,
    financialYearSpendCents: fyAggregate._sum.totalCents ?? 0,
    needsReview,
    recentReceipts,
    recentFolders,
    hasAnySlip: totalSlips > 0,
  };
}
