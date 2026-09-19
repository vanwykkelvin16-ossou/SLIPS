import { createReadStream } from 'node:fs';
import { chmod, copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PutObjectInput, StorageAdapter, StoredObject } from './types';

/**
 * Filesystem-backed private storage for local development and single-node
 * deployments. Objects live outside the web root and are only ever served
 * through authenticated application routes.
 */
export class LocalStorageAdapter implements StorageAdapter {
  readonly name = 'local';
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(process.cwd(), root);
  }

  /** Resolves a key inside the storage root, refusing any traversal attempt. */
  private resolve(key: string): string {
    if (!/^[A-Za-z0-9._\-/]+$/.test(key) || key.includes('..') || key.startsWith('/')) {
      throw new Error('Invalid storage key');
    }
    const full = path.resolve(this.root, key);
    if (full !== this.root && !full.startsWith(this.root + path.sep)) {
      throw new Error('Invalid storage key');
    }
    return full;
  }

  async put({ key, body, contentType }: PutObjectInput): Promise<StoredObject> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body, { mode: 0o600 });
    return { key, sizeBytes: body.byteLength, contentType };
  }

  async putFile(key: string, filePath: string, contentType: string): Promise<StoredObject> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await copyFile(filePath, full);
    await chmod(full, 0o600);
    const info = await stat(full);
    return { key, sizeBytes: info.size, contentType };
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async getStream(key: string): Promise<NodeJS.ReadableStream> {
    const full = this.resolve(key);
    await stat(full);
    return createReadStream(full);
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async size(key: string): Promise<number> {
    const info = await stat(this.resolve(key));
    return info.size;
  }

  async presignedUrl(): Promise<string | null> {
    // No native pre-signing; callers fall back to the signed application route.
    return null;
  }
}
