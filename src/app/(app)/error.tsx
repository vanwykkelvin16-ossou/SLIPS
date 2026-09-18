'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/ui/states';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Server-side detail stays in the server logs; the digest is the only link.
    // eslint-disable-next-line no-console
    console.error('[app] render failed', error.digest ?? error.message);
  }, [error]);

  return (
    <div className="app-container py-12">
      <ErrorState
        title="That screen would not load"
        description="Your documents are safe — this was a problem on our side. Try again, and if it keeps happening let us know."
        onRetry={reset}
      />
    </div>
  );
}
