import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import { getEnv } from '@/lib/env';

export const uploadDescriptor = z.object({
  name: z.string().min(1).max(255),
  type: z.string().min(1).max(100),
  size: z.number().int().positive(),
});
export const uploadRequest = z.object({
  clientUploadId: z.string().regex(/^[A-Za-z0-9._-]{8,64}$/),
  files: z.array(uploadDescriptor).min(1).max(10),
});
const grantSchema = uploadRequest.extend({
  businessId: z.string(),
  userId: z.string(),
  files: z.array(uploadDescriptor.extend({ key: z.string() })).min(1).max(10),
});
export type UploadGrant = z.infer<typeof grantSchema>;
const audience = 'slipsy-staged-upload';
const key = () => new TextEncoder().encode(getEnv().FILE_SIGNING_SECRET);

export async function createUploadGrant(data: z.infer<typeof uploadRequest>, businessId: string, userId: string) {
  const grant: UploadGrant = {
    ...data, businessId, userId,
    files: data.files.map((file) => ({ ...file, key: `staging/${businessId}/${randomUUID()}` })),
  };
  const token = await new SignJWT(grant).setProtectedHeader({ alg: 'HS256' })
    .setIssuer('slipsy').setAudience(audience).setIssuedAt().setExpirationTime('10m').sign(key());
  return { grant, token };
}

export async function verifyUploadGrant(token: string, businessId: string, userId: string): Promise<UploadGrant | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { issuer: 'slipsy', audience, algorithms: ['HS256'] });
    const grant = grantSchema.parse(payload);
    if (grant.businessId !== businessId || grant.userId !== userId) return null;
    if (grant.files.some((file) => !file.key.startsWith(`staging/${businessId}/`))) return null;
    return grant;
  } catch {
    return null;
  }
}

/** Bound the actual read, even if an object changes after its size was checked. */
export async function readUploadStream(stream: NodeJS.ReadableStream, expectedBytes: number): Promise<Buffer> {
  const source = Readable.from(stream);
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for await (const part of source) {
      const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part);
      total += chunk.length;
      if (total > expectedBytes) throw new Error('Upload size does not match');
      chunks.push(chunk);
    }
    if (total !== expectedBytes) throw new Error('Upload size does not match');
    return Buffer.concat(chunks, total);
  } finally {
    source.destroy();
  }
}
