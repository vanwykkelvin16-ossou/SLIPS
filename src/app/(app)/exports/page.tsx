import type { Metadata } from 'next';
import { ExportCentre, type ExportJobView } from '@/components/exports/export-centre';
import { prisma } from '@/lib/db';
import { getFolderOptions } from '@/lib/receipts/view-model';
import { requireOnboardedWorkspace } from '@/lib/session';

export const metadata: Metadata = { title: 'Exports' };
export const dynamic = 'force-dynamic';

export default async function ExportsPage({
  searchParams,
}: {
  searchParams: { folderId?: string; highlight?: string };
}) {
  const session = await requireOnboardedWorkspace();

  const [jobs, folders] = await Promise.all([
    prisma.exportJob.findMany({
      where: { businessId: session.businessId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        type: true,
        status: true,
        label: true,
        fileCount: true,
        sizeBytes: true,
        progress: true,
        periodStart: true,
        periodEnd: true,
        error: true,
        createdAt: true,
        completedAt: true,
        expiresAt: true,
      },
    }),
    getFolderOptions(session.businessId),
  ]);

  const initialJobs: ExportJobView[] = jobs.map((job) => ({
    ...job,
    periodStart: job.periodStart?.toISOString() ?? null,
    periodEnd: job.periodEnd?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
    expiresAt: job.expiresAt?.toISOString() ?? null,
  }));

  return (
    <div className="app-container py-6 lg:py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-extrabold tracking-tight text-forest-900 lg:text-3xl">Exports</h1>
        <p className="mt-1 text-ink-600">Download a tidy pack of your slips whenever you need it.</p>
      </header>

      <ExportCentre
        initialJobs={initialJobs}
        folders={folders}
        initialFolderId={searchParams.folderId}
        highlightId={searchParams.highlight}
      />
    </div>
  );
}
