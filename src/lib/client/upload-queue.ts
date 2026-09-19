'use client';

import { uploadReceipt } from './upload';
import { ApiError } from './api-client';

/**
 * Offline upload queue.
 *
 * A slip captured without a connection is written to IndexedDB on the device
 * and sent as soon as the network returns. Every queued item carries a client
 * upload id which the server treats as an idempotency key, so a retry after a
 * half-completed request can never create a second copy of the same slip.
 */

const DB_NAME = 'slipsy-uploads';
const DB_VERSION = 1;
const STORE = 'queue';

export interface QueuedFile {
  blob: Blob;
  name: string;
  type: string;
}

export interface QueuedUpload {
  id: string;
  files: QueuedFile[];
  createdAt: number;
  attempts: number;
  lastError?: string;
}

export interface QueueSummary {
  id: string;
  createdAt: number;
  attempts: number;
  fileCount: number;
  lastError?: string;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open the upload queue'));
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = run(transaction.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Upload queue operation failed'));
    });
  } finally {
    db.close();
  }
}

export function newUploadId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `up-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function enqueueUpload(files: QueuedFile[], id = newUploadId()): Promise<string> {
  const record: QueuedUpload = { id, files, createdAt: Date.now(), attempts: 0 };
  await withStore('readwrite', (store) => store.put(record) as IDBRequest<IDBValidKey>);
  return id;
}

export async function listQueue(): Promise<QueueSummary[]> {
  try {
    const items = await withStore<QueuedUpload[]>('readonly', (store) => store.getAll() as IDBRequest<QueuedUpload[]>);
    return items
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((item) => ({
        id: item.id,
        createdAt: item.createdAt,
        attempts: item.attempts,
        fileCount: item.files.length,
        lastError: item.lastError,
      }));
  } catch {
    return [];
  }
}

export async function queueLength(): Promise<number> {
  try {
    return await withStore<number>('readonly', (store) => store.count() as IDBRequest<number>);
  } catch {
    return 0;
  }
}

export async function removeFromQueue(id: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(id) as unknown as IDBRequest<undefined>);
}

async function markAttempt(id: string, error: string): Promise<void> {
  const existing = await withStore<QueuedUpload | undefined>(
    'readonly',
    (store) => store.get(id) as IDBRequest<QueuedUpload | undefined>,
  );
  if (!existing) return;
  const updated: QueuedUpload = { ...existing, attempts: existing.attempts + 1, lastError: error };
  await withStore('readwrite', (store) => store.put(updated) as IDBRequest<IDBValidKey>);
}

export interface FlushResult {
  uploaded: string[];
  failed: number;
  remaining: number;
}

/** Maximum attempts before an item stops retrying automatically. */
const MAX_ATTEMPTS = 6;

/**
 * Sends everything waiting in the queue. Safe to call repeatedly — items are
 * removed only after the server confirms them, and the idempotency key stops
 * duplicates if a response is lost in transit.
 */
export async function flushQueue(): Promise<FlushResult> {
  const uploaded: string[] = [];
  let failed = 0;

  let items: QueuedUpload[];
  try {
    items = await withStore<QueuedUpload[]>('readonly', (store) => store.getAll() as IDBRequest<QueuedUpload[]>);
  } catch {
    return { uploaded, failed, remaining: 0 };
  }

  for (const item of items.sort((a, b) => a.createdAt - b.createdAt)) {
    if (item.attempts >= MAX_ATTEMPTS) continue;
    if (typeof navigator !== 'undefined' && !navigator.onLine) break;

    try {
      const files = item.files.map((file) => new File([file.blob], file.name, { type: file.type }));
      const result = await uploadReceipt(files, item.id);
      await removeFromQueue(item.id);
      uploaded.push(result.receiptId);
    } catch (error) {
      // Keep original offline captures on the device after any failure.
      // A permanent error must never silently discard the user's only copy.
      await markAttempt(item.id, error instanceof Error ? error.message : 'Upload failed');
      failed += 1;
      if (error instanceof ApiError && error.isOffline) break;
    }

  }

  return { uploaded, failed, remaining: await queueLength() };
}
