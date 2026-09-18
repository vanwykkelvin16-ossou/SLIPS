import { prisma } from '@/lib/db';

export interface DuplicateCandidate {
  receiptId: string;
  merchantName: string | null;
  purchaseDate: Date | null;
  totalCents: number | null;
  currency: string;
  /** 0-1. `exact-file` is always 1. */
  score: number;
  reason: 'exact-file' | 'same-receipt-number' | 'same-merchant-date-total';
  explanation: string;
}

export interface DuplicateCheckInput {
  businessId: string;
  fileHash?: string | null;
  merchantName?: string | null;
  purchaseDate?: Date | null;
  totalCents?: number | null;
  receiptNumber?: string | null;
  /** Exclude the receipt being edited from its own duplicate check. */
  excludeReceiptId?: string | null;
}

/**
 * Looks for slips the user has probably already captured.
 *
 * Three independent signals, strongest first: the identical file, the same
 * receipt number from the same merchant, and the same merchant/date/total
 * combination. A match is always shown as a warning the user can override —
 * legitimate repeat purchases do happen.
 */
export async function findDuplicates(input: DuplicateCheckInput): Promise<DuplicateCandidate[]> {
  const { businessId, excludeReceiptId } = input;
  const candidates = new Map<string, DuplicateCandidate>();
  const baseWhere = {
    businessId,
    deletedAt: null,
    ...(excludeReceiptId ? { id: { not: excludeReceiptId } } : {}),
  };

  if (input.fileHash) {
    const exact = await prisma.receipt.findMany({
      where: { ...baseWhere, fileHash: input.fileHash },
      select: { id: true, merchantName: true, purchaseDate: true, totalCents: true, currency: true },
      take: 5,
    });
    for (const receipt of exact) {
      candidates.set(receipt.id, {
        receiptId: receipt.id,
        merchantName: receipt.merchantName,
        purchaseDate: receipt.purchaseDate,
        totalCents: receipt.totalCents,
        currency: receipt.currency,
        score: 1,
        reason: 'exact-file',
        explanation: 'You have already uploaded this exact file.',
      });
    }
  }

  const merchant = input.merchantName?.trim();

  if (input.receiptNumber?.trim()) {
    const byNumber = await prisma.receipt.findMany({
      where: {
        ...baseWhere,
        receiptNumber: { equals: input.receiptNumber.trim(), mode: 'insensitive' },
        ...(merchant ? { merchantName: { equals: merchant, mode: 'insensitive' } } : {}),
      },
      select: { id: true, merchantName: true, purchaseDate: true, totalCents: true, currency: true },
      take: 5,
    });
    for (const receipt of byNumber) {
      if (candidates.has(receipt.id)) continue;
      candidates.set(receipt.id, {
        receiptId: receipt.id,
        merchantName: receipt.merchantName,
        purchaseDate: receipt.purchaseDate,
        totalCents: receipt.totalCents,
        currency: receipt.currency,
        score: 0.9,
        reason: 'same-receipt-number',
        explanation: 'A slip with the same receipt number is already saved.',
      });
    }
  }

  if (merchant && input.purchaseDate && input.totalCents !== null && input.totalCents !== undefined) {
    const dayStart = new Date(Date.UTC(input.purchaseDate.getUTCFullYear(), input.purchaseDate.getUTCMonth(), input.purchaseDate.getUTCDate(), 0, 0, 0));
    const dayEnd = new Date(dayStart.getTime() + 86_400_000 - 1);

    const sameDay = await prisma.receipt.findMany({
      where: {
        ...baseWhere,
        merchantName: { equals: merchant, mode: 'insensitive' },
        purchaseDate: { gte: dayStart, lte: dayEnd },
        totalCents: input.totalCents,
      },
      select: { id: true, merchantName: true, purchaseDate: true, totalCents: true, currency: true },
      take: 5,
    });

    for (const receipt of sameDay) {
      if (candidates.has(receipt.id)) continue;
      candidates.set(receipt.id, {
        receiptId: receipt.id,
        merchantName: receipt.merchantName,
        purchaseDate: receipt.purchaseDate,
        totalCents: receipt.totalCents,
        currency: receipt.currency,
        score: 0.75,
        reason: 'same-merchant-date-total',
        explanation: 'Same shop, same day, same amount as a slip you already have.',
      });
    }
  }

  return [...candidates.values()].sort((a, b) => b.score - a.score);
}
