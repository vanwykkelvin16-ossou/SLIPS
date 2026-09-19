'use client';

import { ApiError, apiFetch } from './api-client';

/** Uses signed private storage on Vercel; retains multipart for local installs. */
export async function uploadReceipt(files: File[], clientUploadId: string, options: {
  signal?: AbortSignal;
  onProgress?: (percentage: number) => void;
} = {}): Promise<{ receiptId: string }> {
  const prepared = await apiFetch<{ mode?: 'direct' | 'multipart'; receiptId?: string; token?: string; urls?: string[] }>(
    '/api/receipts/upload/prepare', { method: 'POST', signal: options.signal,
      json: { clientUploadId, files: files.map((file) => ({ name: file.name, size: file.size, type: file.type || 'application/octet-stream' })) } },
  );
  if (prepared.receiptId) return { receiptId: prepared.receiptId };
  if (prepared.mode === 'direct' && prepared.urls && prepared.token) {
    const total = files.reduce((sum, file) => sum + file.size, 0);
    let sent = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      await putFile(prepared.urls[i]!, file, options.signal, (bytes) => options.onProgress?.(Math.round((sent + bytes) / total * 100)));
      sent += file.size;
    }
    return apiFetch('/api/receipts/upload', { method: 'POST', json: { token: prepared.token }, signal: options.signal });
  }
  const body = new FormData();
  body.set('clientUploadId', clientUploadId);
  files.forEach((file) => body.append('files', file));
  const result = await apiFetch<{ receiptId: string }>('/api/receipts/upload', { method: 'POST', body, signal: options.signal });
  options.onProgress?.(100);
  return result;
}

function putFile(url: string, file: File, signal: AbortSignal | undefined, onProgress: (bytes: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    const cleanup = () => signal?.removeEventListener('abort', abort);
    request.open('PUT', url);
    request.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    request.upload.onprogress = (event) => onProgress(event.loaded);
    request.onload = () => {
      cleanup();
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new ApiError({ status: request.status, code: 'storage_upload', message: 'The file could not be uploaded. Please try again.' }));
    };
    request.onerror = () => { cleanup(); reject(new ApiError({ status: 0, code: 'offline', message: 'Could not reach document storage. Check your connection and try again.' })); };
    request.onabort = () => { cleanup(); reject(new DOMException('Upload cancelled', 'AbortError')); };
    if (signal?.aborted) { reject(new DOMException('Upload cancelled', 'AbortError')); return; }
    signal?.addEventListener('abort', abort, { once: true });
    request.send(file);
  });
}
