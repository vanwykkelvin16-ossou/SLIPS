import { NextResponse } from 'next/server';
import { HttpError, parseJson, withWorkspace } from '@/lib/api';
import { getEnv } from '@/lib/env';
import { prisma } from '@/lib/db';
import { getStorage } from '@/lib/storage';
import { createUploadGrant, uploadRequest } from '@/lib/storage/direct-upload';
import { ALLOWED_UPLOAD_MIME_TYPES } from '@/lib/storage/upload-constraints';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withWorkspace(async ({ request, session }) => {
  const data = await parseJson(request, uploadRequest);
  const env = getEnv();
  if (data.files.length > env.MAX_PAGES_PER_RECEIPT || data.files.some((file) => file.size > env.MAX_UPLOAD_BYTES)) {
    throw new HttpError(422, `Choose up to ${env.MAX_PAGES_PER_RECEIPT} pages, each no larger than ${Math.floor(env.MAX_UPLOAD_BYTES / 1048576)} MB.`, 'upload_limit');
  }
  if (data.files.some((file) => ![...ALLOWED_UPLOAD_MIME_TYPES, 'application/octet-stream'].includes(file.type as never))) {
    throw new HttpError(422, 'Choose a photo or PDF to upload.', 'unsupported_type');
  }
  const existing = await prisma.receipt.findFirst({
    where: { businessId: session.businessId, clientUploadId: data.clientUploadId }, select: { id: true },
  });
  if (existing) return NextResponse.json({ receiptId: existing.id });
  const storage = getStorage();
  if (!storage.presignedUploadUrl) return NextResponse.json({ mode: 'multipart' });
  const { grant, token } = await createUploadGrant(data, session.businessId, session.userId);
  const urls = await Promise.all(grant.files.map((file) => storage.presignedUploadUrl!(file.key, file.type, file.size)));
  return NextResponse.json({ mode: 'direct', token, urls }, { headers: { 'Cache-Control': 'no-store' } });
}, { rateLimit: 'upload' });
