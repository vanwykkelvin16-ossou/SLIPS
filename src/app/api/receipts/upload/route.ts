import { NextResponse } from 'next/server';
import { HttpError, withWorkspace } from '@/lib/api';
import { recordAudit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { getEnv } from '@/lib/env';
import {
  createReceiptFromUploads,
  storeUploadedPage,
  UploadRejectedError,
  type StoredUpload,
} from '@/lib/receipts/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Accepts one slip, which may be several pages. Each page is validated by its
 * real bytes, stored privately under a random key, and recorded against the
 * caller's business only.
 */
export const POST = withWorkspace(
  async ({ request, session }) => {
    const env = getEnv();

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new HttpError(400, 'We could not read that upload. Please try again.', 'bad_form');
    }

    const entries = form.getAll('files').filter((entry): entry is File => entry instanceof File);
    if (entries.length === 0) {
      throw new HttpError(400, 'Choose a photo or PDF to upload.', 'no_files');
    }
    if (entries.length > env.MAX_PAGES_PER_RECEIPT) {
      throw new HttpError(
        400,
        `A slip can have at most ${env.MAX_PAGES_PER_RECEIPT} pages.`,
        'too_many_pages',
      );
    }

    const clientUploadIdRaw = form.get('clientUploadId');
    const clientUploadId =
      typeof clientUploadIdRaw === 'string' && /^[A-Za-z0-9._-]{8,64}$/.test(clientUploadIdRaw)
        ? clientUploadIdRaw
        : null;

    // Idempotency: a queued upload that was already accepted returns the same slip.
    if (clientUploadId) {
      const existing = await prisma.receipt.findFirst({
        where: { businessId: session.businessId, clientUploadId },
        select: { id: true, status: true },
      });
      if (existing) {
        return NextResponse.json({ receiptId: existing.id, status: existing.status, deduplicated: true });
      }
    }

    const uploads: StoredUpload[] = [];
    try {
      let pageNumber = 1;
      for (const entry of entries) {
        const buffer = Buffer.from(await entry.arrayBuffer());
        uploads.push(
          await storeUploadedPage({
            businessId: session.businessId,
            buffer,
            declaredMimeType: entry.type || undefined,
            originalFilename: entry.name || `page-${pageNumber}`,
            pageNumber,
          }),
        );
        pageNumber += 1;
      }
    } catch (error) {
      if (error instanceof UploadRejectedError) {
        throw new HttpError(422, error.message, error.code.toLowerCase());
      }
      throw error;
    }

    const { receiptId } = await createReceiptFromUploads({
      businessId: session.businessId,
      userId: session.userId,
      uploads,
      currency: session.currency,
      clientUploadId,
    });

    if (clientUploadId) {
      await prisma.receipt.update({ where: { id: receiptId }, data: { clientUploadId } });
    }

    await recordAudit({
      action: 'receipt.created',
      entityType: 'receipt',
      entityId: receiptId,
      businessId: session.businessId,
      userId: session.userId,
      metadata: { pages: uploads.length, queued: Boolean(clientUploadId) },
      request,
    });

    return NextResponse.json({ receiptId, status: 'PROCESSING', pages: uploads.length }, { status: 201 });
  },
  { rateLimit: 'upload' },
);
