'use client';

import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Registers the service worker and surfaces updates.
 *
 * A new version never replaces the running one silently — the user is told and
 * chooses when to reload, so an upload in progress is never interrupted.
 */
export function ServiceWorkerManager() {
  const [updateReady, setUpdateReady] = useState(false);
  const waitingWorker = useRef<ServiceWorker | null>(null);
  const reloading = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') return;

    let registration: ServiceWorkerRegistration | undefined;

    const onControllerChange = () => {
      if (reloading.current) return;
      reloading.current = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        registration = reg;

        if (reg.waiting && navigator.serviceWorker.controller) {
          waitingWorker.current = reg.waiting;
          setUpdateReady(true);
        }

        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              waitingWorker.current = installing;
              setUpdateReady(true);
            }
          });
        });
      })
      .catch(() => {
        // A failed registration only costs offline support; the app still works.
      });

    // Check for a new build when the app is brought back to the foreground.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') registration?.update().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  if (!updateReady) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-[80] flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] sm:bottom-4 sm:pb-0"
    >
      <div className="flex w-full max-w-md animate-slide-up items-center gap-3 rounded-lg border border-mint-300 bg-surface px-4 py-3 shadow-float">
        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-mint-100 text-forest-700">
          <RefreshCw className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-forest-900">Update available</p>
          <p className="text-sm text-ink-600">A newer version of Slipsy is ready.</p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            waitingWorker.current?.postMessage('SKIP_WAITING');
            setUpdateReady(false);
          }}
        >
          Refresh
        </Button>
      </div>
    </div>
  );
}
