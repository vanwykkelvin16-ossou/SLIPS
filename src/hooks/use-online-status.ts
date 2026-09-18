'use client';

import { useEffect, useState } from 'react';

/** Tracks connectivity. Starts optimistic so server and client markup agree. */
export function useOnlineStatus(): { online: boolean; ready: boolean } {
  const [online, setOnline] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    setReady(true);

    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return { online, ready };
}
