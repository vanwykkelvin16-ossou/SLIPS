import type { Metadata } from 'next';
import { ScanWorkspace } from '@/components/scan/scan-workspace';
import { requireOnboardedWorkspace } from '@/lib/session';

export const metadata: Metadata = { title: 'Scan a slip' };

export default async function ScanPage({ searchParams }: { searchParams: { mode?: string } }) {
  await requireOnboardedWorkspace();
  const initialMode = searchParams.mode === 'upload' ? 'upload' : 'camera';

  return (
    <div className="app-container max-w-2xl py-6 lg:py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-forest-900 lg:text-3xl">Scan a slip</h1>
        <p className="mt-1 text-ink-600">Snap it, check it, done. We will file it in the right place for you.</p>
      </header>

      <ScanWorkspace initialMode={initialMode} />
    </div>
  );
}
