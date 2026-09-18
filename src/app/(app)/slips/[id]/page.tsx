import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertCircle, Clock, FolderOpen, RotateCcw, Tag as TagIcon } from 'lucide-react';
import { DocumentViewer } from '@/components/receipts/document-viewer';
import { ReceiptActions } from '@/components/receipts/receipt-actions';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { receiptFilename } from '@/lib/export/filenames';
import { formatMoney, totalsReconcile } from '@/lib/money';
import { getReceiptDetail } from '@/lib/receipts/service';
import { buildDocumentPages, buildOriginalDownloadUrl, getFolderOptions } from '@/lib/receipts/view-model';
import { requireOnboardedWorkspace } from '@/lib/session';
import { RestoreDeletedBanner } from './restore-banner';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const session = await requireOnboardedWorkspace();
  const receipt = await getReceiptDetail(session.businessId, params.id);
  return { title: receipt?.merchantName ?? 'Slip' };
}

const PAYMENT_LABELS: Record<string, string> = {
  CARD: 'Card',
  CASH: 'Cash',
  EFT: 'EFT / bank transfer',
  DEBIT_ORDER: 'Debit order',
  MOBILE: 'Mobile payment',
  OTHER: 'Other',
  UNKNOWN: 'Not recorded',
};

const DOCUMENT_LABELS: Record<string, string> = {
  RECEIPT: 'Receipt',
  TAX_INVOICE: 'Tax invoice',
  OTHER: 'Expense document',
};

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatDay(date: Date | null): string {
  if (!date) return 'Not recorded';
  return new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}

export default async function SlipDetailPage({ params }: { params: { id: string } }) {
  const session = await requireOnboardedWorkspace();
  const receipt = await getReceiptDetail(session.businessId, params.id);
  if (!receipt) notFound();

  const [pages, folders] = await Promise.all([
    buildDocumentPages(receipt, session.businessId),
    getFolderOptions(session.businessId),
  ]);

  const filename = receiptFilename({
    purchaseDate: receipt.purchaseDate,
    createdAt: receipt.createdAt,
    merchantName: receipt.merchantName,
    totalCents: receipt.totalCents,
    currency: receipt.currency,
    receiptNumber: receipt.receiptNumber,
    extension: receipt.files.find((file) => file.kind === 'ORIGINAL')?.mimeType === 'application/pdf' ? 'pdf' : 'jpg',
  });

  const originalDownloadUrl = await buildOriginalDownloadUrl(receipt, session.businessId, filename);
  const reconciles = totalsReconcile(receipt.subtotalCents, receipt.taxCents, receipt.totalCents);

  const details: Array<{ label: string; value: string }> = [
    { label: 'Purchase date', value: formatDay(receipt.purchaseDate) },
    ...(receipt.purchaseTime ? [{ label: 'Time', value: receipt.purchaseTime }] : []),
    { label: 'Receipt number', value: receipt.receiptNumber ?? '—' },
    { label: 'Document type', value: DOCUMENT_LABELS[receipt.documentType] ?? receipt.documentType },
    { label: 'Category', value: receipt.category?.name ?? 'Uncategorised' },
    { label: 'Payment method', value: PAYMENT_LABELS[receipt.paymentMethod] ?? 'Not recorded' },
    { label: 'Subtotal', value: formatMoney(receipt.subtotalCents, receipt.currency) },
    { label: 'Tax / VAT', value: formatMoney(receipt.taxCents, receipt.currency) },
  ];

  return (
    <div className="app-container py-6 lg:py-8">
      {receipt.deletedAt ? <RestoreDeletedBanner receiptId={receipt.id} /> : null}

      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={receipt.status} />
            {receipt.folder ? (
              <Link
                href={`/slips?folderId=${receipt.folder.id}`}
                className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs font-semibold text-ink-600 transition-colors hover:border-mint-300 hover:text-forest-800 focus-visible:ring-2 focus-visible:ring-green-600"
              >
                <FolderOpen aria-hidden="true" className="h-3.5 w-3.5" />
                {receipt.folder.name}
              </Link>
            ) : null}
          </div>

          <h1 className="mt-2 break-words text-2xl font-extrabold tracking-tight text-forest-900 lg:text-3xl">
            {receipt.merchantName?.trim() || 'Unknown merchant'}
          </h1>
          <p className="mt-1 text-3xl font-extrabold tracking-tight text-green-700">
            {formatMoney(receipt.totalCents, receipt.currency)}
          </p>
        </div>

        {!receipt.deletedAt ? (
          <ReceiptActions
            receiptId={receipt.id}
            merchantName={receipt.merchantName}
            originalDownloadUrl={originalDownloadUrl}
            currentFolderId={receipt.folderId}
            folders={folders}
          />
        ) : null}
      </header>

      {receipt.status === 'NEEDS_REVIEW' && !receipt.deletedAt ? (
        <div className="mb-6 flex flex-col gap-3 rounded-lg border border-warning-500/40 bg-warning-50 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-sm font-medium text-warning-600">
            <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            This slip is waiting for you to confirm its details.
          </p>
          <ButtonLink href={`/slips/${receipt.id}/review`} size="sm">
            Check and file it
          </ButtonLink>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-6 lg:self-start">
          <DocumentViewer pages={pages} merchantName={receipt.merchantName} />
        </div>

        <div className="space-y-5">
          <section aria-labelledby="details-heading" className="rounded-xl border border-line bg-surface p-5 shadow-card">
            <h2 id="details-heading" className="text-lg font-bold text-forest-900">
              Details
            </h2>

            <dl className="mt-4 divide-y divide-line">
              {details.map((item) => (
                <div key={item.label} className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="text-sm text-ink-500">{item.label}</dt>
                  <dd className="text-right text-sm font-semibold text-charcoal">{item.value}</dd>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-4 py-2.5">
                <dt className="text-sm font-semibold text-forest-800">Total</dt>
                <dd className="text-right text-base font-bold text-forest-900">
                  {formatMoney(receipt.totalCents, receipt.currency)}
                </dd>
              </div>
            </dl>

            {reconciles === false ? (
              <p className="mt-3 flex items-start gap-2 rounded-lg bg-warning-50 px-3 py-2 text-sm text-warning-600">
                <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                Subtotal and tax do not add up to the total on this slip.
              </p>
            ) : null}
          </section>

          {receipt.tags.length > 0 ? (
            <section aria-labelledby="tags-heading" className="rounded-xl border border-line bg-surface p-5 shadow-card">
              <h2 id="tags-heading" className="text-lg font-bold text-forest-900">
                Tags
              </h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {receipt.tags.map((link) => (
                  <li key={link.tagId}>
                    <Link href={`/slips?tag=${encodeURIComponent(link.tag.name)}`} className="rounded-full focus-visible:ring-2 focus-visible:ring-green-600">
                      <Badge tone="success" icon={<TagIcon className="h-3 w-3" />}>
                        {link.tag.name}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {receipt.note ? (
            <section aria-labelledby="note-heading" className="rounded-xl border border-line bg-surface p-5 shadow-card">
              <h2 id="note-heading" className="text-lg font-bold text-forest-900">
                Note
              </h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-charcoal">{receipt.note}</p>
            </section>
          ) : null}

          {receipt.lineItems.length > 0 ? (
            <section aria-labelledby="items-heading" className="rounded-xl border border-line bg-surface p-5 shadow-card">
              <h2 id="items-heading" className="text-lg font-bold text-forest-900">
                Items
              </h2>
              <ul className="mt-3 divide-y divide-line">
                {receipt.lineItems.map((item) => (
                  <li key={item.id} className="flex items-baseline justify-between gap-4 py-2">
                    <span className="min-w-0 text-sm text-charcoal">
                      {item.quantity ? <span className="text-ink-500">{item.quantity.toString()} × </span> : null}
                      {item.description}
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-charcoal">
                      {formatMoney(item.totalCents, receipt.currency)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-ink-500">
                Items were read from the document and may not be complete. The total above is what counts.
              </p>
            </section>
          ) : null}

          <section aria-labelledby="audit-heading" className="rounded-xl border border-line bg-page p-5">
            <h2 id="audit-heading" className="flex items-center gap-2 text-sm font-bold text-forest-800">
              <Clock aria-hidden="true" className="h-4 w-4" />
              History
            </h2>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-500">Uploaded</dt>
                <dd className="text-right font-medium text-charcoal">
                  {formatDateTime(receipt.createdAt)}
                  {receipt.uploadedBy ? ` by ${receipt.uploadedBy.firstName}` : ''}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-500">Last changed</dt>
                <dd className="text-right font-medium text-charcoal">{formatDateTime(receipt.updatedAt)}</dd>
              </div>
              {receipt.reviewedAt ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-500">Checked and filed</dt>
                  <dd className="text-right font-medium text-charcoal">{formatDateTime(receipt.reviewedAt)}</dd>
                </div>
              ) : null}
              {receipt.ocrProvider ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-500">Read by</dt>
                  <dd className="text-right font-medium text-charcoal">{receipt.ocrProvider}</dd>
                </div>
              ) : null}
              {receipt.duplicateOfId ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-500">Copied from</dt>
                  <dd className="text-right font-medium">
                    <Link href={`/slips/${receipt.duplicateOfId}`} className="rounded text-green-700 underline underline-offset-2">
                      the original slip
                    </Link>
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>

          {receipt.deletedAt ? (
            <p className="flex items-center gap-2 text-sm text-ink-500">
              <RotateCcw aria-hidden="true" className="h-4 w-4" />
              Deleted on {formatDateTime(receipt.deletedAt)}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
