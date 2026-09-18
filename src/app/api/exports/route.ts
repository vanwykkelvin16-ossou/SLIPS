import { ExportStatus, ExportType } from '@prisma/client';
import { NextResponse } from 'next/server';
import { HttpError, parseJson, withWorkspace } from '@/lib/api';
import { recordAudit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { buildExportWhere } from '@/lib/export/build';
import { startExportJob } from '@/lib/export/queue';
import { exportRequestSchema } from '@/lib/validation';

export const runtime = 'nodejs';

export const GET = withWorkspace(async ({ session }) => {
  const jobs = await prisma.exportJob.findMany({
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
  });

  return NextResponse.json({ jobs });
});

export const POST = withWorkspace(
  async ({ request, session }) => {
    const data = await parseJson(request, exportRequestSchema);

    if (data.folderId) {
      const folder = await prisma.folder.findFirst({
        where: { id: data.folderId, businessId: session.businessId },
        select: { id: true, name: true },
      });
      if (!folder) throw new HttpError(422, 'That folder is not available.', 'invalid_folder');
    }

    const type = data.type as ExportType;
    const params = {
      receiptIds: data.receiptIds,
      folderId: data.folderId,
      from: data.from,
      to: data.to,
      includeCombinedPdf: data.includeCombinedPdf,
      summaryFormat: data.summaryFormat,
    };

    // Refuse an export that would contain nothing, rather than producing an empty archive.
    const where = await buildExportWhere(session.businessId, type, params);
    const count = await prisma.receipt.count({ where });
    if (count === 0) {
      throw new HttpError(422, 'There are no slips to export for that selection.', 'empty_export');
    }

    const job = await prisma.exportJob.create({
      data: {
        businessId: session.businessId,
        requestedByUserId: session.userId,
        type,
        status: ExportStatus.QUEUED,
        params,
        label: data.label ?? null,
        periodStart: data.from ? new Date(`${data.from}T00:00:00.000Z`) : null,
        periodEnd: data.to ? new Date(`${data.to}T23:59:59.999Z`) : null,
      },
      select: { id: true, status: true, createdAt: true },
    });

    await recordAudit({
      action: 'export.requested',
      entityType: 'export',
      entityId: job.id,
      businessId: session.businessId,
      userId: session.userId,
      metadata: { type, slips: count, combinedPdf: data.includeCombinedPdf },
      request,
    });

    startExportJob(job.id);

    return NextResponse.json({ job, slipCount: count }, { status: 202 });
  },
  { rateLimit: 'export' },
);
