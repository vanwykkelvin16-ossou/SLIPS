import { FileKind, Prisma, ReceiptStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { ensureSystemFolders, folderIdsWithDescendants, suggestFolderId } from '@/lib/folders';
import { imageDimensions, makePreview, makeThumbnail } from '@/lib/images';
import { parseAmountToCents } from '@/lib/money';
import { LOW_CONFIDENCE_THRESHOLD, runOcr } from '@/lib/ocr';
import { buildStorageKey, getStorage } from '@/lib/storage';
import { validateUpload } from '@/lib/storage/validate';
import type { ReceiptQuery } from '@/lib/validation';
import { findDuplicates, type DuplicateCandidate } from './duplicates';

export interface StoredUpload {
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  width: number | null;
  height: number | null;
  pageNumber: number;
  thumbnailKey: string | null;
  previewKey: string | null;
}

export class UploadRejectedError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

/**
 * Validates one uploaded page, stores the original privately, and derives a
 * thumbnail and screen preview. The original bytes are never modified.
 */
export async function storeUploadedPage(options: {
  businessId: string;
  buffer: Buffer;
  declaredMimeType: string | undefined;
  originalFilename: string;
  pageNumber: number;
}): Promise<StoredUpload> {
  const validation = await validateUpload(options.buffer, options.declaredMimeType);
  if (!validation.ok) throw new UploadRejectedError(validation.message, validation.code);

  const storage = getStorage();
  const key = buildStorageKey({ businessId: options.businessId, scope: 'receipts', mimeType: validation.mimeType });
  await storage.put({ key, body: options.buffer, contentType: validation.mimeType });

  let thumbnailKey: string | null = null;
  let previewKey: string | null = null;
  let dimensions: { width: number; height: number } | null = null;

  if (validation.mimeType !== 'application/pdf') {
    dimensions = await imageDimensions(options.buffer);

    const thumbnail = await makeThumbnail(options.buffer);
    if (thumbnail) {
      thumbnailKey = buildStorageKey({ businessId: options.businessId, scope: 'thumbnails', mimeType: 'image/jpeg' });
      await storage.put({ key: thumbnailKey, body: thumbnail.buffer, contentType: 'image/jpeg' });
    }

    const preview = await makePreview(options.buffer);
    if (preview) {
      previewKey = buildStorageKey({ businessId: options.businessId, scope: 'previews', mimeType: 'image/jpeg' });
      await storage.put({ key: previewKey, body: preview.buffer, contentType: 'image/jpeg' });
    }
  }

  return {
    storageKey: key,
    originalFilename: sanitiseFilename(options.originalFilename),
    mimeType: validation.mimeType,
    sizeBytes: validation.sizeBytes,
    sha256: validation.sha256,
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
    pageNumber: options.pageNumber,
    thumbnailKey,
    previewKey,
  };
}

/** Keeps a readable original name for exports while stripping anything dangerous. */
export function sanitiseFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'upload';
  return base.replace(/[^\w .\-()]+/g, '_').slice(0, 120) || 'upload';
}

/** Creates the receipt row plus its file rows in a single transaction. */
export async function createReceiptFromUploads(options: {
  businessId: string;
  userId: string;
  uploads: StoredUpload[];
  currency: string;
  clientUploadId?: string | null;
}): Promise<{ receiptId: string }> {
  const { businessId, userId, uploads, currency } = options;
  const first = uploads[0];
  if (!first) throw new UploadRejectedError('No file was received.', 'EMPTY');

  const { unfiled } = await ensureSystemFolders(businessId);

  const receipt = await prisma.$transaction(async (tx) => {
    const created = await tx.receipt.create({
      data: {
        businessId,
        uploadedByUserId: userId,
        clientUploadId: options.clientUploadId ?? null,
        status: ReceiptStatus.PROCESSING,
        currency,
        fileHash: first.sha256,
        folderId: unfiled.id,
      },
      select: { id: true },
    });

    for (const upload of uploads) {
      await tx.receiptFile.create({
        data: {
          receiptId: created.id,
          businessId,
          kind: FileKind.ORIGINAL,
          storageKey: upload.storageKey,
          originalFilename: upload.originalFilename,
          mimeType: upload.mimeType,
          sizeBytes: upload.sizeBytes,
          sha256: upload.sha256,
          pageNumber: upload.pageNumber,
          width: upload.width,
          height: upload.height,
        },
      });

      if (upload.thumbnailKey) {
        await tx.receiptFile.create({
          data: {
            receiptId: created.id,
            businessId,
            kind: FileKind.THUMBNAIL,
            storageKey: upload.thumbnailKey,
            originalFilename: `thumb-${upload.pageNumber}.jpg`,
            mimeType: 'image/jpeg',
            sizeBytes: 0,
            sha256: `${upload.sha256}-thumb-${upload.pageNumber}`,
            pageNumber: upload.pageNumber,
          },
        });
      }

      if (upload.previewKey) {
        await tx.receiptFile.create({
          data: {
            receiptId: created.id,
            businessId,
            kind: FileKind.PREVIEW,
            storageKey: upload.previewKey,
            originalFilename: `preview-${upload.pageNumber}.jpg`,
            mimeType: 'image/jpeg',
            sizeBytes: 0,
            sha256: `${upload.sha256}-preview-${upload.pageNumber}`,
            pageNumber: upload.pageNumber,
          },
        });
      }
    }

    return created;
  });

  return { receiptId: receipt.id };
}

export interface ProcessResult {
  status: ReceiptStatus;
  suggestion: {
    merchantName: string | null;
    receiptNumber: string | null;
    purchaseDate: string | null;
    purchaseTime: string | null;
    currency: string;
    subtotalCents: number | null;
    taxCents: number | null;
    totalCents: number | null;
    paymentMethod: string;
    lineItems: Array<{ description: string; quantity: number | null; unitCents: number | null; totalCents: number | null }>;
  };
  lowConfidenceFields: string[];
  confidence: number;
  ocrFailed: boolean;
  duplicates: DuplicateCandidate[];
  suggestedFolderId: string | null;
  suggestedCategoryId: string | null;
}

/**
 * Runs OCR over a receipt's first page and saves the suggestions.
 *
 * Nothing is auto-filed: the receipt lands in NEEDS_REVIEW so the user always
 * confirms the numbers. A failed extraction is not an error for the user —
 * the document is kept and the fields are simply left blank.
 */
export async function processReceiptOcr(options: {
  receiptId: string;
  businessId: string;
  defaultCurrency: string;
  folderStructure: 'YEAR_MONTH' | 'YEAR_MONTH_CATEGORY' | 'CATEGORY_ONLY';
}): Promise<ProcessResult> {
  const receipt = await prisma.receipt.findFirst({
    where: { id: options.receiptId, businessId: options.businessId, deletedAt: null },
    include: { files: { where: { kind: FileKind.ORIGINAL }, orderBy: { pageNumber: 'asc' } } },
  });
  if (!receipt) throw new UploadRejectedError('That slip could not be found.', 'NOT_FOUND');

  const original = receipt.files[0];
  if (!original) throw new UploadRejectedError('That slip has no document attached.', 'NO_FILE');

  let ocrError: string | null = null;
  let parsed: Awaited<ReturnType<typeof runOcr>>['parsed'] | null = null;
  let rawText = '';
  let provider = '';

  try {
    const buffer = await getStorage().get(original.storageKey);
    const outcome = await runOcr(
      { buffer, mimeType: original.mimeType },
      { defaultCurrency: options.defaultCurrency },
    );
    parsed = outcome.parsed;
    rawText = outcome.raw.text.slice(0, 20000);
    provider = outcome.raw.provider;
    if (!outcome.raw.text.trim()) {
      ocrError = 'no-text-detected';
    }
  } catch (error) {
    ocrError = error instanceof Error ? error.message.slice(0, 200) : 'ocr-failed';
  }

  const currency = parsed?.currency ?? options.defaultCurrency;
  const categoryId = parsed ? await guessCategoryId(options.businessId, parsed.merchantName) : null;
  const category = categoryId
    ? await prisma.category.findFirst({ where: { id: categoryId, businessId: options.businessId }, select: { name: true } })
    : null;

  const suggestedFolderId = await suggestFolderId(options.businessId, {
    purchaseDate: parsed?.purchaseDate ?? null,
    categoryName: category?.name ?? null,
    structure: options.folderStructure,
    needsReview: true,
  });

  const lowConfidenceFields = parsed
    ? Object.entries(parsed.fieldConfidence)
        .filter(([, score]) => typeof score === 'number' && score < LOW_CONFIDENCE_THRESHOLD)
        .map(([field]) => field)
    : [];

  await prisma.receipt.update({
    where: { id: receipt.id },
    data: {
      status: ReceiptStatus.NEEDS_REVIEW,
      // The suggestion is applied now so the review screen shows where the slip
      // will land, and confirming it keeps that folder. The user can override.
      folderId: suggestedFolderId,
      merchantName: parsed?.merchantName ?? null,
      receiptNumber: parsed?.receiptNumber ?? null,
      purchaseDate: parsed?.purchaseDate ?? null,
      purchaseTime: parsed?.purchaseTime ?? null,
      currency,
      subtotalCents: parsed?.subtotalCents ?? null,
      taxCents: parsed?.taxCents ?? null,
      totalCents: parsed?.totalCents ?? null,
      paymentMethod: parsed?.paymentMethod ?? 'UNKNOWN',
      categoryId,
      ocrProvider: provider || null,
      ocrRawText: rawText || null,
      ocrConfidence: parsed?.confidence ?? 0,
      fieldConfidence: (parsed?.fieldConfidence ?? {}) as Prisma.InputJsonValue,
      ocrError,
    },
  });

  if (parsed?.lineItems.length) {
    await prisma.receiptLineItem.deleteMany({ where: { receiptId: receipt.id } });
    await prisma.receiptLineItem.createMany({
      data: parsed.lineItems.slice(0, 60).map((item, index) => ({
        receiptId: receipt.id,
        position: index,
        description: item.description.slice(0, 200),
        quantity: item.quantity !== null ? new Prisma.Decimal(item.quantity.toFixed(3)) : null,
        unitCents: item.unitCents,
        totalCents: item.totalCents,
      })),
    });
  }

  const duplicates = await findDuplicates({
    businessId: options.businessId,
    fileHash: receipt.fileHash,
    merchantName: parsed?.merchantName ?? null,
    purchaseDate: parsed?.purchaseDate ?? null,
    totalCents: parsed?.totalCents ?? null,
    receiptNumber: parsed?.receiptNumber ?? null,
    excludeReceiptId: receipt.id,
  });

  return {
    status: ReceiptStatus.NEEDS_REVIEW,
    suggestion: {
      merchantName: parsed?.merchantName ?? null,
      receiptNumber: parsed?.receiptNumber ?? null,
      purchaseDate: parsed?.purchaseDate ? toDateInput(parsed.purchaseDate) : null,
      purchaseTime: parsed?.purchaseTime ?? null,
      currency,
      subtotalCents: parsed?.subtotalCents ?? null,
      taxCents: parsed?.taxCents ?? null,
      totalCents: parsed?.totalCents ?? null,
      paymentMethod: parsed?.paymentMethod ?? 'UNKNOWN',
      lineItems: parsed?.lineItems ?? [],
    },
    lowConfidenceFields,
    confidence: parsed?.confidence ?? 0,
    ocrFailed: Boolean(ocrError) || !parsed,
    duplicates,
    suggestedFolderId,
    suggestedCategoryId: categoryId,
  };
}

/** Learns from the workspace's own history: same merchant -> same category. */
async function guessCategoryId(businessId: string, merchantName: string | null): Promise<string | null> {
  if (!merchantName?.trim()) return null;
  const previous = await prisma.receipt.findFirst({
    where: {
      businessId,
      deletedAt: null,
      categoryId: { not: null },
      merchantName: { equals: merchantName.trim(), mode: 'insensitive' },
    },
    orderBy: { updatedAt: 'desc' },
    select: { categoryId: true },
  });
  return previous?.categoryId ?? null;
}

export function toDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function fromDateInput(value: string): Date {
  return new Date(`${value}T12:00:00.000Z`);
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export interface ReceiptListItem {
  id: string;
  merchantName: string | null;
  purchaseDate: Date | null;
  totalCents: number | null;
  currency: string;
  status: ReceiptStatus;
  documentType: string;
  categoryName: string | null;
  categoryColor: string | null;
  folderName: string | null;
  folderId: string | null;
  thumbnailFileId: string | null;
  hasPdf: boolean;
  createdAt: Date;
  deletedAt: Date | null;
}

export interface ReceiptListResult {
  items: ReceiptListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  sumCents: number;
}

/** Builds the Prisma filter for a library query. Always scoped to one business. */
export async function buildReceiptWhere(businessId: string, query: Partial<ReceiptQuery>): Promise<Prisma.ReceiptWhereInput> {
  const where: Prisma.ReceiptWhereInput = {
    businessId,
    deletedAt: query.includeDeleted ? { not: null } : null,
  };

  if (query.search?.trim()) {
    const term = query.search.trim();
    where.OR = [
      { merchantName: { contains: term, mode: 'insensitive' } },
      { receiptNumber: { contains: term, mode: 'insensitive' } },
      { note: { contains: term, mode: 'insensitive' } },
      { tags: { some: { tag: { name: { contains: term, mode: 'insensitive' } } } } },
    ];
  }

  if (query.folderId) {
    const ids = await folderIdsWithDescendants(businessId, query.folderId);
    where.folderId = { in: ids };
  }

  if (query.categoryId) where.categoryId = query.categoryId;
  if (query.status) where.status = query.status;
  if (query.tag) where.tags = { some: { tag: { name: { equals: query.tag, mode: 'insensitive' } } } };

  if (query.from || query.to) {
    where.purchaseDate = {
      ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
      ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
    };
  }

  const min = query.minAmount ? parseAmountToCents(query.minAmount) : null;
  const max = query.maxAmount ? parseAmountToCents(query.maxAmount) : null;
  if (min !== null || max !== null) {
    where.totalCents = { ...(min !== null ? { gte: min } : {}), ...(max !== null ? { lte: max } : {}) };
  }

  return where;
}

function orderFor(sort: ReceiptQuery['sort']): Prisma.ReceiptOrderByWithRelationInput[] {
  switch (sort) {
    case 'oldest':
      return [{ purchaseDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }];
    case 'highest':
      return [{ totalCents: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }];
    case 'lowest':
      return [{ totalCents: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }];
    case 'merchant':
      return [{ merchantName: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }];
    case 'newest':
    default:
      return [{ purchaseDate: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }];
  }
}

export async function listReceipts(businessId: string, query: ReceiptQuery): Promise<ReceiptListResult> {
  const where = await buildReceiptWhere(businessId, query);
  const skip = (query.page - 1) * query.pageSize;

  const [rows, total, aggregate] = await Promise.all([
    prisma.receipt.findMany({
      where,
      orderBy: orderFor(query.sort),
      skip,
      take: query.pageSize,
      select: {
        id: true,
        merchantName: true,
        purchaseDate: true,
        totalCents: true,
        currency: true,
        status: true,
        documentType: true,
        createdAt: true,
        deletedAt: true,
        folderId: true,
        category: { select: { name: true, color: true } },
        folder: { select: { name: true } },
        files: {
          where: { kind: { in: [FileKind.THUMBNAIL, FileKind.ORIGINAL] } },
          orderBy: [{ kind: 'asc' }, { pageNumber: 'asc' }],
          select: { id: true, kind: true, mimeType: true },
        },
      },
    }),
    prisma.receipt.count({ where }),
    prisma.receipt.aggregate({ where, _sum: { totalCents: true } }),
  ]);

  const items: ReceiptListItem[] = rows.map((row) => {
    const thumbnail = row.files.find((file) => file.kind === FileKind.THUMBNAIL);
    const originals = row.files.filter((file) => file.kind === FileKind.ORIGINAL);
    return {
      id: row.id,
      merchantName: row.merchantName,
      purchaseDate: row.purchaseDate,
      totalCents: row.totalCents,
      currency: row.currency,
      status: row.status,
      documentType: row.documentType,
      categoryName: row.category?.name ?? null,
      categoryColor: row.category?.color ?? null,
      folderName: row.folder?.name ?? null,
      folderId: row.folderId,
      thumbnailFileId: thumbnail?.id ?? null,
      hasPdf: originals.some((file) => file.mimeType === 'application/pdf'),
      createdAt: row.createdAt,
      deletedAt: row.deletedAt,
    };
  });

  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    sumCents: aggregate._sum.totalCents ?? 0,
  };
}

export async function getReceiptDetail(businessId: string, receiptId: string) {
  return prisma.receipt.findFirst({
    where: { id: receiptId, businessId },
    include: {
      files: { orderBy: [{ kind: 'asc' }, { pageNumber: 'asc' }] },
      lineItems: { orderBy: { position: 'asc' } },
      tags: { include: { tag: true } },
      category: true,
      folder: true,
      uploadedBy: { select: { firstName: true, email: true } },
    },
  });
}
