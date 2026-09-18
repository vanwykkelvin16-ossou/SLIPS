'use client';

import { useEffect, useState } from 'react';
import { CloudOff, Wifi } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/use-online-status';

/** A calm, persistent indication of connectivity — never a blocking modal. */
export function NetworkStatusBanner() {
  const { online, ready } = useOnlineStatus();
  const [showBackOnline, setShowBackOnline] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!online) {
      setWasOffline(true);
      setShowBackOnline(false);
      return;
    }
    if (wasOffline) {
      setShowBackOnline(true);
      const timer = setTimeout(() => setShowBackOnline(false), 4000);
      return () => clearTimeout(timer);
    }
    return;
  }, [online, ready, wasOffline]);

  if (!ready || (online && !showBackOnline)) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-x-0 top-0 z-[90] flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white safe-top ${
        online ? 'bg-green-600' : 'bg-warning-600'
      }`}
    >
      {online ? (
        <>
          <Wifi aria-hidden="true" className="h-4 w-4" />
          <span>Back online — syncing anything that was waiting.</span>
        </>
      ) : (
        <>
          <CloudOff aria-hidden="true" className="h-4 w-4" />
          <span>You are offline. Slips you capture will be saved and sent later.</span>
        </>
      )}
    </div>
  );
}
