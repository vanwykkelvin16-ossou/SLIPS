import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  session: { businessId: 'business-1', userId: 'user-1', onboarded: true, currency: 'ZAR' } as Record<string, unknown> | null,
  objects: new Map<string, Buffer>(),
  existing: null as { id: string; status: string } | null,
  stored: vi.fn(), created: vi.fn(),
}));
vi.mock('@/lib/session', () => ({ getWorkspaceSession: async () => state.session }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: async () => ({ allowed: true }) }));
vi.mock('@/lib/audit', () => ({ recordAudit: async () => undefined }));
vi.mock('@/lib/db', () => ({ prisma: { receipt: { findFirst: async () => state.existing } } }));
vi.mock('@/lib/storage', () => ({ getStorage: () => ({
  size: async (key: string) => state.objects.get(key)?.length ?? 0,
  getStream: async (key: string) => Readable.from([state.objects.get(key)!]),
  delete: async (key: string) => { state.objects.delete(key); },
}) }));
vi.mock('@/lib/receipts/service', async () => {
  const { validateUpload } = await import('@/lib/storage/validate');
  class UploadRejectedError extends Error { constructor(message: string, readonly code: string) { super(message); } }
  return {
    UploadRejectedError,
    storeUploadedPage: async (input: {buffer: Buffer; declaredMimeType: string}) => {
      state.stored(input);
      const result = await validateUpload(input.buffer, input.declaredMimeType);
      if (!result.ok) throw new UploadRejectedError(result.message, result.code);
      return {storageKey: 'permanent-copy', thumbnailKey: null, previewKey: null};
    },
    createReceiptFromUploads: async (input: unknown) => { state.created(input); return {receiptId: 'receipt-1'}; },
  };
});
import { POST } from '@/app/api/receipts/upload/route';
import { createUploadGrant } from '@/lib/storage/direct-upload';

beforeEach(() => {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost/test';
  process.env.AUTH_SECRET = 'a'.repeat(48);
  process.env.FILE_SIGNING_SECRET = 'b'.repeat(48);
  state.objects.clear(); state.stored.mockClear(); state.created.mockClear(); state.existing = null;
  state.session = { businessId: 'business-1', userId: 'user-1', onboarded: true, currency: 'ZAR' };
});
const request = (token: string) => new Request('https://slips.example.com/api/receipts/upload', {
  method: 'POST', headers: {'content-type': 'application/json', origin: 'https://slips.example.com', host: 'slips.example.com'},
  body: JSON.stringify({token}),
});
async function stage(buffer: Buffer) {
  const data = await createUploadGrant({clientUploadId: 'upload-123', files: [{name: 'slip.pdf', type: 'application/pdf', size: buffer.length}]}, 'business-1', 'user-1');
  state.objects.set(data.grant.files[0]!.key, buffer);
  return data;
}
describe('staged upload finalisation', () => {
  it('files a PDF above 4.5 MB using a small JSON request and removes staging', async () => {
    const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(5 * 1024 * 1024)]);
    const {token} = await stage(pdf);
    const req = request(token);
    expect((await req.clone().text()).length).toBeLessThan(2000);
    const response = await POST(req);
    expect(response.status).toBe(201);
    expect((await response.json()).receiptId).toBe('receipt-1');
    expect(state.stored.mock.calls[0]![0].buffer.equals(pdf)).toBe(true);
    expect(state.created.mock.calls[0]![0].clientUploadId).toBe('upload-123');
    expect(state.objects.size).toBe(0);
  });
  it('rejects anonymous and other-business requests before accessing stored bytes', async () => {
    const {token} = await stage(Buffer.alloc(20));
    state.session = null;
    expect((await POST(request(token))).status).toBe(401);
    state.session = { businessId: 'business-2', userId: 'user-1', onboarded: true };
    expect((await POST(request(token))).status).toBe(403);
    expect(state.stored).not.toHaveBeenCalled();
    expect(state.objects.size).toBe(1);
  });
  it('rejects invalid real contents and incomplete files', async () => {
    const {grant, token} = await stage(Buffer.alloc(20));
    expect((await POST(request(token))).status).toBe(422);
    expect(state.created).not.toHaveBeenCalled();
    state.objects.set(grant.files[0]!.key, Buffer.alloc(5));
    expect((await POST(request(token))).status).toBe(422);
    expect(state.objects.size).toBe(0);
  });
  it('returns the existing receipt on retry instead of creating another', async () => {
    const {token} = await stage(Buffer.alloc(20));
    state.existing = {id: 'already-filed', status: 'NEEDS_REVIEW'};
    const response = await POST(request(token));
    expect((await response.json()).receiptId).toBe('already-filed');
    expect(state.created).not.toHaveBeenCalled();
    expect(state.objects.size).toBe(0);
  });
});
