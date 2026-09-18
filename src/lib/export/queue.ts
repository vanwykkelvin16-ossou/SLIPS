import { ExportStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { runExportJob } from './build';

/**
 * Starts a queued export without blocking the request that created it.
 *
 * On a long-running Node server (the documented deployment shape) this is all
 * that is needed. On platforms that freeze a function once it has responded,
 * run `npm run worker:exports` alongside the app — it picks up anything left
 * in QUEUED. Either way the user's browser never waits for the archive.
 */
export function startExportJob(jobId: string): void {
  setTimeout(() => {
    runExportJob(jobId).catch((error) => {
      // eslint-disable-next-line no-console
      console.error('[export] job failed', { jobId, error: (error as Error).message });
    });
  }, 10);
}

/** Picks up jobs left behind by a restart or a serverless cold stop. */
export async function processPendingExports(limit = 3): Promise<number> {
  const stale = new Date(Date.now() - 10 * 60_000);

  // Anything stuck in PROCESSING for ten minutes is retried from the start.
  await prisma.exportJob.updateMany({
    where: { status: ExportStatus.PROCESSING, startedAt: { lt: stale } },
    data: { status: ExportStatus.QUEUED, progress: 0 },
  });

  const queued = await prisma.exportJob.findMany({
    where: { status: ExportStatus.QUEUED },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { id: true },
  });

  for (const job of queued) {
    await runExportJob(job.id);
  }

  return queued.length;
}

/** Removes expired archives from storage; the job row is kept for the audit trail. */
export async function expireOldExports(): Promise<number> {
  const expired = await prisma.exportJob.findMany({
    where: { status: ExportStatus.READY, expiresAt: { lt: new Date() } },
    select: { id: true, storageKey: true },
  });

  if (expired.length === 0) return 0;

  const { getStorage } = await import('@/lib/storage');
  const storage = getStorage();

  for (const job of expired) {
    if (job.storageKey) await storage.delete(job.storageKey).catch(() => undefined);
    await prisma.exportJob.update({
      where: { id: job.id },
      data: { status: ExportStatus.EXPIRED, storageKey: null },
    });
  }

  return expired.length;
}
