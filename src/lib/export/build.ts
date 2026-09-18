import { createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import archiver from 'archiver';
import { ExportStatus, FileKind, type Prisma } from '@prisma/client';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { brand } from '@/config/brand';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { exportReadyEmail } from '@/lib/email/templates';
import { getAppUrl, getEnv } from '@/lib/env';
import { folderIdsWithDescendants } from '@/lib/folders';
import { formatMoney } from '@/lib/money';
import { buildStorageKey, getStorage } from '@/lib/storage';
import { archiveFolderPath, exportArchiveName, receiptFilename, uniquePath } from './filenames';
import { buildReceiptPdf } from './receipt-pdf';
import { buildCsv, buildXlsx, type SummaryRow } from './summary';

/** Combined-PDF generation is capped so a huge export cannot run away. */
const COMBINED_PDF_LIMIT = 150;

export interface ExportParams {
  receiptIds?: string[];
  folderId?: string;
  from?: string;
  to?: string;
  includeCombinedPdf?: boolean;
  summaryFormat?: 'csv' | 'xlsx' | 'both';
}

/**
 * Builds one export archive end to end: gathers the slips, writes the ZIP to a
 * temporary file (never into memory), uploads it to private storage and marks
 * the job ready. Failures are recorded on the job so the user sees a real
 * status rather than a spinner that never ends.
 */
export async function runExportJob(jobId: string): Promise<void> {
  const job = await prisma.exportJob.findUnique({
    where: { id: jobId },
    include: { business: { select: { id: true, name: true, currency: true } }, requestedBy: { select: { id: true, email: true, firstName: true, notifyOnExport: true, notifyByEmail: true } } },
  });
  if (!job) return;
  if (job.status !== ExportStatus.QUEUED) return;

  await prisma.exportJob.update({
    where: { id: job.id },
    data: { status: ExportStatus.PROCESSING, startedAt: new Date(), progress: 1 },
  });

  const workDir = await mkdtemp(path.join(tmpdir(), 'slipsy-export-'));
  const zipPath = path.join(workDir, 'export.zip');

  try {
    const params = (job.params ?? {}) as ExportParams;
    const where = await buildExportWhere(job.businessId, job.type, params);

    const receipts = await prisma.receipt.findMany({
      where,
      orderBy: [{ purchaseDate: 'asc' }, { createdAt: 'asc' }],
      include: {
        files: { where: { kind: FileKind.ORIGINAL }, orderBy: { pageNumber: 'asc' } },
        category: { select: { name: true } },
        folder: { select: { name: true } },
        tags: { include: { tag: { select: { name: true } } } },
        lineItems: { orderBy: { position: 'asc' } },
      },
    });

    const storage = getStorage();
    const archive = archiver('zip', { zlib: { level: 6 } });
    const output = createWriteStream(zipPath);

    const archiveFinished = new Promise<void>((resolve, reject) => {
      output.on('close', () => resolve());
      output.on('error', reject);
      archive.on('error', reject);
      archive.on('warning', (warning) => {
        if (warning.code !== 'ENOENT') reject(warning);
      });
    });

    archive.pipe(output);

    const usedPaths = new Set<string>();
    const summaryRows: SummaryRow[] = [];
    const combined = params.includeCombinedPdf ? await PDFDocument.create() : null;
    let filesAdded = 0;

    for (const [index, receipt] of receipts.entries()) {
      const folderPath = archiveFolderPath(receipt.purchaseDate, receipt.createdAt);
      const originals = receipt.files;
      const pageBuffers: Array<{ buffer: Buffer; mimeType: string }> = [];

      for (const [pageIndex, file] of originals.entries()) {
        let buffer: Buffer;
        try {
          buffer = await storage.get(file.storageKey);
        } catch {
          continue; // A missing object must not sink the whole export.
        }

        pageBuffers.push({ buffer, mimeType: file.mimeType });

        const extension = file.mimeType === 'application/pdf' ? 'pdf' : file.mimeType.split('/')[1] ?? 'bin';
        const baseName = receiptFilename({
          purchaseDate: receipt.purchaseDate,
          createdAt: receipt.createdAt,
          merchantName: receipt.merchantName,
          totalCents: receipt.totalCents,
          currency: receipt.currency,
          receiptNumber: receipt.receiptNumber,
          extension,
        });
        const suffix = originals.length > 1 ? `-p${pageIndex + 1}` : '';
        const withSuffix = suffix ? baseName.replace(/\.([^.]+)$/, `${suffix}.$1`) : baseName;
        const entryPath = uniquePath(usedPaths, `${folderPath}/${withSuffix}`);

        archive.append(buffer, { name: entryPath });
        filesAdded += 1;

        if (pageIndex === 0) {
          summaryRows.push(toSummaryRow(receipt, entryPath));
        }
      }

      if (originals.length === 0) {
        summaryRows.push(toSummaryRow(receipt, '(no file)'));
      }

      if (combined && index < COMBINED_PDF_LIMIT) {
        try {
          const pdfBytes = await buildReceiptPdf({
            businessName: job.business.name,
            merchantName: receipt.merchantName,
            receiptNumber: receipt.receiptNumber,
            purchaseDate: receipt.purchaseDate,
            purchaseTime: receipt.purchaseTime,
            currency: receipt.currency,
            subtotalCents: receipt.subtotalCents,
            taxCents: receipt.taxCents,
            totalCents: receipt.totalCents,
            paymentMethod: receipt.paymentMethod,
            documentType: receipt.documentType,
            categoryName: receipt.category?.name ?? null,
            folderName: receipt.folder?.name ?? null,
            note: receipt.note,
            tags: receipt.tags.map((link) => link.tag.name),
            lineItems: receipt.lineItems.map((item) => ({
              description: item.description,
              quantity: item.quantity ? item.quantity.toString() : null,
              unitCents: item.unitCents,
              totalCents: item.totalCents,
            })),
            uploadedAt: receipt.createdAt,
            updatedAt: receipt.updatedAt,
            pages: pageBuffers,
          });

          const source = await PDFDocument.load(pdfBytes);
          const copied = await combined.copyPages(source, source.getPageIndices());
          copied.forEach((page) => combined.addPage(page));
        } catch {
          // A slip that cannot be rendered is skipped from the combined PDF only.
        }
      }

      if (index % 10 === 0) {
        const progress = Math.min(95, Math.round(((index + 1) / Math.max(receipts.length, 1)) * 90) + 2);
        await prisma.exportJob.update({ where: { id: job.id }, data: { progress } }).catch(() => undefined);
      }
    }

    const format = params.summaryFormat ?? 'csv';
    if (format === 'csv' || format === 'both') {
      archive.append(buildCsv(summaryRows), { name: 'expense-summary.csv' });
    }
    if (format === 'xlsx' || format === 'both') {
      archive.append(await buildXlsx(summaryRows, job.business.name), { name: 'expense-summary.xlsx' });
    }

    if (combined) {
      const indexPdf = await withIndexPage(combined, job.business.name, summaryRows, receipts.length);
      archive.append(Buffer.from(indexPdf), { name: 'all-slips.pdf' });
    }

    archive.append(readmeText(job.business.name, receipts.length, summaryRows), { name: 'README.txt' });

    await archive.finalize();
    await archiveFinished;

    const info = await stat(zipPath);
    const key = buildStorageKey({ businessId: job.businessId, scope: 'exports', mimeType: 'application/zip' });
    await storage.putFile(key, zipPath, 'application/zip');

    const retentionHours = getEnv().EXPORT_RETENTION_HOURS;

    await prisma.exportJob.update({
      where: { id: job.id },
      data: {
        status: ExportStatus.READY,
        storageKey: key,
        sizeBytes: info.size,
        fileCount: filesAdded,
        progress: 100,
        completedAt: new Date(),
        expiresAt: new Date(Date.now() + retentionHours * 3_600_000),
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'export.completed',
        entityType: 'export',
        entityId: job.id,
        businessId: job.businessId,
        userId: job.requestedByUserId,
        metadata: { fileCount: filesAdded, slips: receipts.length },
      },
    });

    const recipient = job.requestedBy;
    if (recipient?.notifyByEmail && recipient.notifyOnExport) {
      await sendEmail(
        exportReadyEmail(recipient.email, recipient.firstName, `${getAppUrl()}/exports`, receipts.length),
      ).catch(() => undefined);
    }
  } catch (error) {
    await prisma.exportJob.update({
      where: { id: jobId },
      data: {
        status: ExportStatus.FAILED,
        error: error instanceof Error ? error.message.slice(0, 300) : 'Export failed',
        completedAt: new Date(),
      },
    });
    await prisma.auditLog
      .create({
        data: {
          action: 'export.failed',
          entityType: 'export',
          entityId: jobId,
          businessId: job.businessId,
          userId: job.requestedByUserId,
        },
      })
      .catch(() => undefined);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function buildExportWhere(
  businessId: string,
  type: string,
  params: ExportParams,
): Promise<Prisma.ReceiptWhereInput> {
  const where: Prisma.ReceiptWhereInput = { businessId, deletedAt: null };

  if (type === 'SELECTION' && params.receiptIds?.length) {
    where.id = { in: params.receiptIds };
  }

  if (type === 'FOLDER' && params.folderId) {
    where.folderId = { in: await folderIdsWithDescendants(businessId, params.folderId) };
  }

  if (type === 'DATE_RANGE' && params.from && params.to) {
    where.purchaseDate = {
      gte: new Date(`${params.from}T00:00:00.000Z`),
      lte: new Date(`${params.to}T23:59:59.999Z`),
    };
  }

  return where;
}

type ReceiptWithRelations = Prisma.ReceiptGetPayload<{
  include: {
    files: true;
    category: { select: { name: true } };
    folder: { select: { name: true } };
    tags: { include: { tag: { select: { name: true } } } };
    lineItems: true;
  };
}>;

function toSummaryRow(receipt: ReceiptWithRelations, filename: string): SummaryRow {
  return {
    date: receipt.purchaseDate ? receipt.purchaseDate.toISOString().slice(0, 10) : '',
    time: receipt.purchaseTime ?? '',
    merchant: receipt.merchantName ?? '',
    receiptNumber: receipt.receiptNumber ?? '',
    documentType: receipt.documentType === 'TAX_INVOICE' ? 'Tax invoice' : receipt.documentType === 'OTHER' ? 'Other' : 'Receipt',
    category: receipt.category?.name ?? '',
    folder: receipt.folder?.name ?? '',
    paymentMethod: receipt.paymentMethod === 'UNKNOWN' ? '' : receipt.paymentMethod.replace('_', ' ').toLowerCase(),
    currency: receipt.currency,
    subtotalCents: receipt.subtotalCents,
    taxCents: receipt.taxCents,
    totalCents: receipt.totalCents,
    tags: receipt.tags.map((link) => link.tag.name).join('; '),
    note: receipt.note ?? '',
    filename,
    status: receipt.status === 'FILED' ? 'Filed' : receipt.status === 'NEEDS_REVIEW' ? 'Needs review' : receipt.status,
  };
}

/** Prepends a contents page to the combined PDF. */
async function withIndexPage(
  combined: PDFDocument,
  businessName: string,
  rows: SummaryRow[],
  total: number,
): Promise<Uint8Array> {
  const regular = await combined.embedFont(StandardFonts.Helvetica);
  const bold = await combined.embedFont(StandardFonts.HelveticaBold);
  const page = combined.insertPage(0, [595.28, 841.89]);

  const forest = rgb(0.04, 0.24, 0.16);
  const muted = rgb(0.42, 0.48, 0.45);

  page.drawRectangle({ x: 0, y: 841.89 - 92, width: 595.28, height: 92, color: forest });
  page.drawText(`${brand.name} export`, { x: 48, y: 841.89 - 50, size: 20, font: bold, color: rgb(1, 1, 1) });
  page.drawText(businessName.slice(0, 60), { x: 48, y: 841.89 - 70, size: 10, font: regular, color: rgb(0.72, 0.89, 0.81) });

  let y = 841.89 - 130;
  page.drawText(`${total} slip${total === 1 ? '' : 's'} included`, { x: 48, y, size: 13, font: bold, color: forest });
  y -= 24;

  for (const row of rows.slice(0, COMBINED_PDF_LIMIT)) {
    if (y < 70) break;
    const label = `${row.date || '—'}  ${(row.merchant || 'Unknown merchant').slice(0, 42)}`;
    page.drawText(label.replace(/[^\x20-\x7E]/g, ' '), { x: 48, y, size: 9.5, font: regular, color: rgb(0.12, 0.16, 0.14) });
    const amount = formatMoney(row.totalCents, row.currency).replace(/ /g, ' ').replace(/[^\x20-\x7E]/g, '');
    page.drawText(amount, { x: 595.28 - 48 - regular.widthOfTextAtSize(amount, 9.5), y, size: 9.5, font: regular, color: rgb(0.12, 0.16, 0.14) });
    y -= 14;
  }

  if (rows.length > COMBINED_PDF_LIMIT) {
    page.drawText(`… and ${rows.length - COMBINED_PDF_LIMIT} more — see expense-summary in this archive.`, {
      x: 48,
      y: Math.max(y - 6, 56),
      size: 9,
      font: regular,
      color: muted,
    });
  }

  return combined.save();
}

function readmeText(businessName: string, slipCount: number, rows: SummaryRow[]): Buffer {
  const total = rows.reduce((sum, row) => sum + (row.totalCents ?? 0), 0);
  const currency = rows[0]?.currency ?? 'ZAR';

  return Buffer.from(
    [
      `${brand.name} export`,
      `Business: ${businessName}`,
      `Generated: ${new Date().toISOString()}`,
      '',
      `Slips included: ${slipCount}`,
      `Total recorded: ${formatMoney(total, currency).replace(/ /g, ' ')}`,
      '',
      'What is in this archive',
      '  • Original documents, organised into Year/Month folders.',
      '  • expense-summary.csv / .xlsx — one row per slip, ready for your accounting software.',
      '  • all-slips.pdf — every slip with its details, when the combined PDF option was chosen.',
      '',
      'Filenames follow: YYYY-MM-DD_Merchant_Amount_ReceiptNumber.ext',
      '',
      'Amounts are recorded exactly as captured, in the currency shown in the summary.',
      `Questions? ${brand.supportEmail}`,
      '',
    ].join('\n'),
    'utf8',
  );
}
