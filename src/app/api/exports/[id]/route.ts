import { ExportStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import { notFound, withWorkspace } from '@/lib/api';
import { prisma } from '@/lib/db';
import { startExportJob } from '@/lib/export/queue';
import { signedFileUrl } from '@/lib/storage/signing';

export const runtime = 'nodejs';

export const GET = withWorkspace<{ id: string }>(async ({ session, params }) => {
  const job = await prisma.exportJob.findFirst({
    where: { id: params.id, businessId: session.businessId },
    select: {
      id: true,
      type: true,
      status: true,
      label: true,
      progress: true,
      fileCount: true,
      sizeBytes: true,
      error: true,
      createdAt: true,
      completedAt: true,
      expiresAt: true,
      storageKey: true,
    },
  });

  if (!job) return notFound('That export');

  const expired = job.expiresAt ? job.expiresAt < new Date() : false;
  const downloadUrl =
    job.status === ExportStatus.READY && job.storageKey && !expired
      ? await signedFileUrl(
          { resourceId: job.id, resourceType: 'export', businessId: session.businessId, downloadFilename: `${job.label ?? 'slipsy-export'}.zip` },
          600,
        )
      : null;

  const { storageKey, ...rest } = job;
  return NextResponse.json({ job: { ...rest, expired }, downloadUrl });
});

/** Retries a failed export, or nudges one that is still queued. */
export const POST = withWorkspace<{ id: string }>(async ({ session, params }) => {
  const job = await prisma.exportJob.findFirst({
    where: { id: params.id, businessId: session.businessId },
    select: { id: true, status: true },
  });
  if (!job) return notFound('That export');

  if (job.status === ExportStatus.FAILED || job.status === ExportStatus.EXPIRED) {
    await prisma.exportJob.update({
      where: { id: job.id },
      data: { status: ExportStatus.QUEUED, error: null, progress: 0, startedAt: null, completedAt: null },
    });
  }

  startExportJob(job.id);
  return NextResponse.json({ ok: true });
});

export const DELETE = withWorkspace<{ id: string }>(async ({ session, params }) => {
  const job = await prisma.exportJob.findFirst({
    where: { id: params.id, businessId: session.businessId },
    select: { id: true, storageKey: true },
  });
  if (!job) return notFound('That export');

  if (job.storageKey) {
    const { getStorage } = await import('@/lib/storage');
    await getStorage().delete(job.storageKey).catch(() => undefined);
  }

  await prisma.exportJob.delete({ where: { id: job.id } });
  return NextResponse.json({ ok: true });
});
