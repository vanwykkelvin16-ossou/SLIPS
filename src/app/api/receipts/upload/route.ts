import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { HttpError, parseJson, withWorkspace } from '@/lib/api';
import { recordAudit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { getStorage } from '@/lib/storage';
import { readUploadStream, verifyUploadGrant, type UploadGrant } from '@/lib/storage/direct-upload';
import { createReceiptFromUploads, storeUploadedPage, UploadRejectedError, type StoredUpload } from '@/lib/receipts/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Validates staged S3 bytes or local multipart uploads before creating a receipt. */
export const POST = withWorkspace(async ({ request, session }) => {
  const env = getEnv();
  const storage = getStorage();
  let grant: UploadGrant | null = null;
  let entries: File[] = [];
  let clientUploadId: string | null = null;

  if (request.headers.get('content-type')?.includes('application/json')) {
    const data = await parseJson(request, z.object({ token: z.string().max(20000) }));
    grant = await verifyUploadGrant(data.token, session.businessId, session.userId);
    if (!grant) throw new HttpError(403, 'That upload has expired. Please try again.', 'invalid_upload');
    clientUploadId = grant.clientUploadId;
    if (grant.files.length > env.MAX_PAGES_PER_RECEIPT || grant.files.some((file) => file.size > env.MAX_UPLOAD_BYTES)) {
      throw new HttpError(422, 'That upload exceeds the file limit.', 'upload_limit');
    }
  } else {
    let form: FormData;
    try { form = await request.formData(); }
    catch { throw new HttpError(400, 'We could not read that upload. Please try again.', 'bad_form'); }
    entries = form.getAll('files').filter((entry): entry is File => entry instanceof File);
    if (!entries.length || entries.length > env.MAX_PAGES_PER_RECEIPT) {
      throw new HttpError(422, `Choose between 1 and ${env.MAX_PAGES_PER_RECEIPT} pages.`, 'upload_limit');
    }
    const raw = form.get('clientUploadId');
    clientUploadId = typeof raw === 'string' && /^[A-Za-z0-9._-]{8,64}$/.test(raw) ? raw : null;
  }

  const findExisting = () => clientUploadId ? prisma.receipt.findFirst({
    where: { businessId: session.businessId, clientUploadId }, select: { id: true, status: true },
  }) : Promise.resolve(null);
  const cleanStaging = async () => {
    if (grant) await Promise.allSettled(grant.files.map((file) => storage.delete(file.key)));
  };
  const existing = await findExisting();
  if (existing) {
    await cleanStaging();
    return NextResponse.json({ receiptId: existing.id, status: existing.status, deduplicated: true });
  }

  const uploads: StoredUpload[] = [];
  let receiptId: string;
  try {
    const files = grant?.files ?? entries.map((file) => ({ name: file.name, type: file.type, size: file.size }));
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      let buffer: Buffer;
      if (grant) {
        const staged = grant.files[i]!;
        if (await storage.size(staged.key) !== staged.size) {
          throw new HttpError(422, 'The uploaded file is incomplete. Please try again.', 'size_mismatch');
        }
        buffer = await readUploadStream(await storage.getStream(staged.key), staged.size);
      } else {
        buffer = Buffer.from(await entries[i]!.arrayBuffer());
      }
      // Copies validated bytes to a fresh, permanent key. The client can never
      // overwrite the filed copy with a still-valid staging upload URL.
      uploads.push(await storeUploadedPage({
        businessId: session.businessId, buffer, declaredMimeType: file.type,
        originalFilename: file.name, pageNumber: i + 1,
      }));
    }
    ({ receiptId } = await createReceiptFromUploads({
      businessId: session.businessId, userId: session.userId, uploads,
      currency: session.currency, clientUploadId,
    }));
  } catch (error) {
    await Promise.allSettled(uploads.flatMap((file) => [file.storageKey, file.thumbnailKey, file.previewKey])
      .filter((key): key is string => Boolean(key)).map((key) => storage.delete(key)));
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const duplicate = await findExisting();
      if (duplicate) return NextResponse.json({ receiptId: duplicate.id, deduplicated: true });
    }
    if (error instanceof UploadRejectedError) throw new HttpError(422, error.message, error.code.toLowerCase());
    throw error;
  } finally {
    await cleanStaging();
  }

  await recordAudit({ action: 'receipt.created', entityType: 'receipt', entityId: receiptId,
    businessId: session.businessId, userId: session.userId,
    metadata: { pages: uploads.length, queued: Boolean(clientUploadId) }, request });
  return NextResponse.json({ receiptId, status: 'PROCESSING', pages: uploads.length }, { status: 201 });
}, { rateLimit: 'upload' });
