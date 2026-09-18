import { NextResponse } from 'next/server';
import { HttpError, notFound, withWorkspace } from '@/lib/api';
import { prisma } from '@/lib/db';
import { processReceiptOcr, UploadRejectedError } from '@/lib/receipts/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Runs extraction for one slip. Kept separate from the upload so the upload
 * request stays short, the UI can show real progress, and a failed extraction
 * can be retried without re-uploading the document.
 */
export const POST = withWorkspace<{ id: string }>(
  async ({ session, params }) => {
    const receipt = await prisma.receipt.findFirst({
      where: { id: params.id, businessId: session.businessId, deletedAt: null },
      select: { id: true },
    });
    if (!receipt) return notFound('That slip');

    try {
      const result = await processReceiptOcr({
        receiptId: params.id,
        businessId: session.businessId,
        defaultCurrency: session.currency,
        folderStructure: session.folderStructure,
      });
      return NextResponse.json(result);
    } catch (error) {
      if (error instanceof UploadRejectedError) {
        throw new HttpError(422, error.message, error.code.toLowerCase());
      }

      // Extraction failed, but the document is safe — let the user fill it in.
      await prisma.receipt.update({
        where: { id: params.id },
        data: {
          status: 'NEEDS_REVIEW',
          ocrError: error instanceof Error ? error.message.slice(0, 200) : 'processing-failed',
        },
      });

      return NextResponse.json({
        status: 'NEEDS_REVIEW',
        ocrFailed: true,
        confidence: 0,
        lowConfidenceFields: [],
        duplicates: [],
        suggestedFolderId: null,
        suggestedCategoryId: null,
        suggestion: {
          merchantName: null,
          receiptNumber: null,
          purchaseDate: null,
          purchaseTime: null,
          currency: session.currency,
          subtotalCents: null,
          taxCents: null,
          totalCents: null,
          paymentMethod: 'UNKNOWN',
          lineItems: [],
        },
      });
    }
  },
  { rateLimit: 'upload' },
);
