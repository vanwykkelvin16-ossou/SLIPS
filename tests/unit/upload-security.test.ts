import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildStorageKey } from '@/lib/storage';
import { LocalStorageAdapter } from '@/lib/storage/local';
import { sha256, sniffMimeType } from '@/lib/storage/validate';
import { extensionForMime } from '@/lib/storage/upload-constraints';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(16)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)]);
const HEIC = Buffer.concat([Buffer.alloc(4), Buffer.from('ftyp'), Buffer.from('heic'), Buffer.alloc(8)]);

describe('content sniffing', () => {
  it('identifies the formats a slip can be', () => {
    expect(sniffMimeType(JPEG)).toBe('image/jpeg');
    expect(sniffMimeType(PNG)).toBe('image/png');
    expect(sniffMimeType(PDF)).toBe('application/pdf');
    expect(sniffMimeType(WEBP)).toBe('image/webp');
    expect(sniffMimeType(HEIC)).toBe('image/heic');
  });

  it('refuses anything else, whatever it claims to be', () => {
    // A Windows executable renamed to .jpg is still an executable.
    const exe = Buffer.concat([Buffer.from([0x4d, 0x5a]), Buffer.alloc(32)]);
    expect(sniffMimeType(exe)).toBeNull();

    const elf = Buffer.concat([Buffer.from([0x7f]), Buffer.from('ELF'), Buffer.alloc(32)]);
    expect(sniffMimeType(elf)).toBeNull();

    const script = Buffer.from('<?php system($_GET["c"]); ?>'.padEnd(64, ' '));
    expect(sniffMimeType(script)).toBeNull();

    const svgWithScript = Buffer.from('<svg onload="alert(1)"></svg>'.padEnd(64, ' '));
    expect(sniffMimeType(svgWithScript)).toBeNull();

    expect(sniffMimeType(Buffer.alloc(4))).toBeNull();
  });

  it('hashes contents for duplicate detection', () => {
    expect(sha256(JPEG)).toBe(sha256(Buffer.from(JPEG)));
    expect(sha256(JPEG)).not.toBe(sha256(PNG));
    expect(sha256(JPEG)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('maps types to safe extensions', () => {
    expect(extensionForMime('image/jpeg')).toBe('jpg');
    expect(extensionForMime('application/pdf')).toBe('pdf');
    expect(extensionForMime('application/x-msdownload')).toBe('bin');
  });
});

describe('storage keys', () => {
  it('never contains anything from the uploaded filename', () => {
    const key = buildStorageKey({
      businessId: 'cme123',
      scope: 'receipts',
      mimeType: 'image/jpeg',
      date: new Date('2026-09-18T00:00:00Z'),
    });

    expect(key).toMatch(/^businesses\/cme123\/receipts\/2026\/09\/[0-9a-f-]{36}\.jpg$/);
  });

  it('strips anything unexpected from the business id', () => {
    const key = buildStorageKey({ businessId: '../../etc', scope: 'receipts', mimeType: 'image/png' });
    expect(key).not.toContain('..');
    expect(key).toContain('businesses/etc/');
  });

  it('is different every time, so keys cannot be guessed', () => {
    const args = { businessId: 'cme123', scope: 'receipts' as const, mimeType: 'image/jpeg' };
    expect(buildStorageKey(args)).not.toBe(buildStorageKey(args));
  });
});

describe('local storage adapter', () => {
  let root: string;
  let adapter: LocalStorageAdapter;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'slipsy-storage-test-'));
    adapter = new LocalStorageAdapter(root);
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('stores and reads an object', async () => {
    const key = 'businesses/b1/receipts/2026/09/file.jpg';
    await adapter.put({ key, body: JPEG, contentType: 'image/jpeg' });

    expect(await adapter.exists(key)).toBe(true);
    expect((await adapter.get(key)).equals(JPEG)).toBe(true);
    expect(await adapter.size(key)).toBe(JPEG.byteLength);
  });

  it('writes objects that only the server user can read', async () => {
    const key = 'businesses/b1/receipts/2026/09/private.jpg';
    await adapter.put({ key, body: JPEG, contentType: 'image/jpeg' });

    const { stat } = await import('node:fs/promises');
    const info = await stat(path.join(root, key));
    expect(info.mode & 0o077).toBe(0);
  });

  it('refuses to escape its root directory', async () => {
    for (const key of ['../escape.jpg', 'a/../../escape.jpg', '/etc/passwd', 'a/../../../etc/passwd']) {
      await expect(adapter.get(key)).rejects.toThrow('Invalid storage key');
      await expect(adapter.put({ key, body: JPEG, contentType: 'image/jpeg' })).rejects.toThrow('Invalid storage key');
    }
  });

  it('refuses keys with characters that have no business in a key', async () => {
    for (const key of ['a b.jpg', 'a\0b.jpg', 'a;rm -rf.jpg', 'a$(whoami).jpg']) {
      await expect(adapter.get(key)).rejects.toThrow('Invalid storage key');
    }
  });

  it('deletes objects', async () => {
    const key = 'businesses/b1/receipts/2026/09/gone.jpg';
    await adapter.put({ key, body: PNG, contentType: 'image/png' });
    await adapter.delete(key);
    expect(await adapter.exists(key)).toBe(false);
  });

  it('has no pre-signing, so reads go through the authenticated route', async () => {
    expect(await adapter.presignedUrl()).toBeNull();
  });

  it('copies a file from disk without buffering it', async () => {
    const source = path.join(root, 'source.bin');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(source, PDF);

    const key = 'businesses/b1/exports/2026/09/export.zip';
    const stored = await adapter.putFile(key, source, 'application/zip');

    expect(stored.sizeBytes).toBe(PDF.byteLength);
    expect((await readFile(path.join(root, key))).equals(PDF)).toBe(true);
  });
});
