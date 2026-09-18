'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { ProgressBar, StatusAnnouncer } from '@/components/ui/feedback';
import { ErrorState } from '@/components/ui/states';
import { apiFetch } from '@/lib/client/api-client';

const STEPS = ['Reading the details…', 'Checking the totals…', 'Filing everything safely…'] as const;

/**
 * Runs extraction for a slip that arrived here unprocessed — a queued offline
 * upload, or someone opening the link directly. The document is already stored,
 * so a failure here just means the details are filled in by hand.
 */
export function ProcessOnArrival({ receiptId }: { receiptId: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const ticker = setInterval(() => setStep((current) => Math.min(current + 1, STEPS.length - 1)), 2500);

    apiFetch(`/api/receipts/${receiptId}/process`, { method: 'POST' })
      .then(() => router.refresh())
      .catch(() => setFailed(true))
      .finally(() => clearInterval(ticker));

    return () => clearInterval(ticker);
  }, [receiptId, router]);

  if (failed) {
    return (
      <div className="app-container py-10">
        <ErrorState
          title="We could not read this one"
          description="Your document is stored safely. Open it and fill the details in yourself — it only takes a moment."
          onRetry={() => router.push(`/slips/${receiptId}`)}
          retryLabel="Open the slip"
        />
      </div>
    );
  }

  return (
    <div className="app-container py-16">
      <div className="mx-auto max-w-md text-center">
        <span aria-hidden="true" className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-mint-100 text-forest-700">
          <CheckCircle2 className="h-7 w-7 animate-pulse" />
        </span>
        <h1 className="text-xl font-bold text-forest-900">{STEPS[step]}</h1>
        <p className="mt-2 text-sm text-ink-500">This usually takes a few seconds.</p>
        <ProgressBar className="mt-6" value={null} label={STEPS[step] ?? 'Working'} />
        <StatusAnnouncer message={STEPS[step] ?? 'Working'} />
      </div>
    </div>
  );
}
