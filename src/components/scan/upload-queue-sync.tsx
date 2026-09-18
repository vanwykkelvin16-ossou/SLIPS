'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CloudUpload } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { flushQueue, queueLength } from '@/lib/client/upload-queue';

/**
 * Watches the offline queue and empties it whenever the device is online.
 * Mounted once in the app shell so a queued slip syncs from any screen.
 */
export function UploadQueueSync() {
  const { online, ready } = useOnlineStatus();
  const { toast } = useToast();
  const router = useRouter();
  const [pending, setPending] = useState(0);
  const flushing = useRef(false);

  const refreshCount = useCallback(async () => {
    setPending(await queueLength());
  }, []);

  const run = useCallback(async () => {
    if (flushing.current) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    if ((await queueLength()) === 0) {
      setPending(0);
      return;
    }

    flushing.current = true;
    try {
      const result = await flushQueue();
      if (result.uploaded.length > 0) {
        toast({
          title: `${result.uploaded.length} slip${result.uploaded.length === 1 ? '' : 's'} synced`,
          description: 'Everything you captured offline is now safely filed.',
          tone: 'success',
        });
        router.refresh();
      }
      setPending(result.remaining);
    } finally {
      flushing.current = false;
    }
  }, [router, toast]);

  useEffect(() => {
    if (!ready) return;
    void refreshCount();
    if (online) void run();
  }, [online, ready, refreshCount, run]);

  useEffect(() => {
    // The service worker asks us to flush when Background Sync fires.
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'FLUSH_UPLOAD_QUEUE') void run();
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [run]);

  useEffect(() => {
    const onQueued = () => {
      void refreshCount();
      if (navigator.onLine) void run();
    };
    window.addEventListener('slipsy:queued', onQueued);
    return () => window.removeEventListener('slipsy:queued', onQueued);
  }, [refreshCount, run]);

  if (pending === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+0.75rem)] z-40 flex justify-center px-4 lg:bottom-4"
    >
      <p className="flex items-center gap-2 rounded-full border border-warning-500/40 bg-warning-50 px-4 py-2 text-sm font-semibold text-warning-600 shadow-card">
        <CloudUpload aria-hidden="true" className="h-4 w-4" />
        {pending} slip{pending === 1 ? '' : 's'} waiting to sync
      </p>
    </div>
  );
}
