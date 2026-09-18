import type { Metadata } from 'next';
import { CloudOff } from 'lucide-react';
import { brand } from '@/config/brand';
import { Wordmark } from '@/components/brand/logo';
import { RetryButton } from '@/components/pwa/retry-button';

export const metadata: Metadata = {
  title: 'You are offline',
  robots: { index: false, follow: false },
};

/**
 * Cached by the service worker and shown when a page cannot be reached.
 * Deliberately static: no private data is ever stored in the offline cache.
 */
export default function OfflinePage() {
  return (
    <main id="main-content" className="flex min-h-dvh flex-col items-center justify-center px-6 py-12 text-center">
      <Wordmark size="md" className="mb-10" />

      <span aria-hidden="true" className="mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-mint-100 text-forest-700">
        <CloudOff className="h-9 w-9" />
      </span>

      <h1 className="text-2xl font-bold tracking-tight text-forest-900">You are offline</h1>
      <p className="mt-3 max-w-sm text-balance text-ink-600">
        {brand.name} needs a connection to load this page. Anything you captured while offline is saved on this device and
        will sync automatically.
      </p>

      <RetryButton className="mt-7" />

      <p className="mt-10 text-sm text-ink-500">Your documents are safe. Nothing has been lost.</p>
    </main>
  );
}
