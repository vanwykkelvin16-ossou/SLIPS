import type { Metadata } from 'next';
import { FileQuestion } from 'lucide-react';
import { Wordmark } from '@/components/brand/logo';
import { ButtonLink } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main id="main-content" className="flex min-h-dvh flex-col items-center justify-center px-6 py-12 text-center">
      <Wordmark size="md" className="mb-10" />

      <span aria-hidden="true" className="mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-mint-100 text-forest-700">
        <FileQuestion className="h-9 w-9" />
      </span>

      <h1 className="text-2xl font-bold tracking-tight text-forest-900">We could not find that</h1>
      <p className="mt-3 max-w-sm text-balance text-ink-600">
        The page or slip you are looking for does not exist, or it belongs to a different workspace.
      </p>

      <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
        <ButtonLink href="/dashboard">Go to my dashboard</ButtonLink>
        <ButtonLink href="/slips" variant="secondary">
          Browse my slips
        </ButtonLink>
      </div>
    </main>
  );
}
