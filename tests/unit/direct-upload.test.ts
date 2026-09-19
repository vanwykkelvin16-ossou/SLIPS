import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';
import { createUploadGrant, readUploadStream, verifyUploadGrant } from '@/lib/storage/direct-upload';
import { S3StorageAdapter } from '@/lib/storage/s3';

const configure = () => {
  vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost/test');
  vi.stubEnv('AUTH_SECRET', 'a'.repeat(48));
  vi.stubEnv('FILE_SIGNING_SECRET', 'b'.repeat(48));
};
afterEach(() => vi.unstubAllEnvs());

describe('private direct upload', () => {
  it('accepts only the same business and user and refuses tampering', async () => {
    configure();
    const { grant, token } = await createUploadGrant({clientUploadId: 'upload-123', files: [{name: '../../slip.pdf', type: 'application/pdf', size: 6000000}]}, 'business-1', 'user-1');
    expect(grant.files[0]!.key).toMatch(/^staging\/business-1\/[a-f0-9-]+$/);
    expect(await verifyUploadGrant(token, 'business-1', 'user-1')).toEqual(grant);
    expect(await verifyUploadGrant(token, 'business-2', 'user-1')).toBeNull();
    expect(await verifyUploadGrant(token, 'business-1', 'user-2')).toBeNull();
    const [header, payload, signature] = token.split('.');
    expect(await verifyUploadGrant(`${header}.${payload}.${signature![0] === 'A' ? 'B' : 'A'}${signature!.slice(1)}`, 'business-1', 'user-1')).toBeNull();
  });

  it('refuses expired upload grants', async () => {
    configure();
    const { grant } = await createUploadGrant({clientUploadId: 'upload-123', files: [{name: 'slip.pdf', type: 'application/pdf', size: 10}]}, 'business-1', 'user-1');
    const expired = await new SignJWT(grant).setProtectedHeader({alg: 'HS256'}).setIssuer('slipsy')
      .setAudience('slipsy-staged-upload').setExpirationTime(1).sign(new TextEncoder().encode('b'.repeat(48)));
    expect(await verifyUploadGrant(expired, 'business-1', 'user-1')).toBeNull();
  });

  it('reads files above the Vercel request limit directly and bounds the actual stream', async () => {
    const bytes = Buffer.alloc(6 * 1024 * 1024, 42);
    expect((await readUploadStream(Readable.from([bytes]), bytes.length)).length).toBe(bytes.length);
    await expect(readUploadStream(Readable.from([Buffer.alloc(8), Buffer.alloc(8)]), 10)).rejects.toThrow('size');
    await expect(readUploadStream(Readable.from([Buffer.alloc(5)]), 10)).rejects.toThrow('size');
  });

  it('signs the exact object, type and length without requiring browser cookies', async () => {
    const storage = new S3StorageAdapter({bucket: 'slips', region: 'auto', endpoint: 'https://storage.example.com', forcePathStyle: true, accessKeyId: 'test-key', secretAccessKey: 'test-secret'});
    const url = new URL(await storage.presignedUploadUrl('staging/business-1/file', 'application/pdf', 6000000));
    expect(url.pathname).toBe('/slips/staging/business-1/file');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-length');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-type');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('600');
  });
});
