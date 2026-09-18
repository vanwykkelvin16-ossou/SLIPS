import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { DocumentViewer } from '@/components/receipts/document-viewer';
import { ReceiptForm, toFormValues } from '@/components/receipts/receipt-form';
import { findDuplicates } from '@/lib/receipts/duplicates';
import { getReceiptDetail } from '@/lib/receipts/service';
import {
  buildDocumentPages,
  getCategoryOptions,
  getFolderOptions,
  lowConfidenceFieldsOf,
} from '@/lib/receipts/view-model';
import { requireOnboardedWorkspace } from '@/lib/session';
import { ProcessOnArrival } from './process-on-arrival';

export const metadata: Metadata = { title: 'Check the details' };
export const dynamic = 'force-dynamic';

export default async function ReviewPage({ params }: { params: { id: string } }) {
  const session = await requireOnboardedWorkspace();
  const receipt = await getReceiptDetail(session.businessId, params.id);
  if (!receipt || receipt.deletedAt) notFound();

  // Arriving before extraction has run (a queued upload, or a direct link).
  if (receipt.status === 'PROCESSING' || receipt.status === 'UPLOADING') {
    return <ProcessOnArrival receiptId={receipt.id} />;
  }

  const [pages, categories, folders, duplicates] = await Promise.all([
    buildDocumentPages(receipt, session.businessId),
    getCategoryOptions(session.businessId),
    getFolderOptions(session.businessId),
    findDuplicates({
      businessId: session.businessId,
      fileHash: receipt.fileHash,
      merchantName: receipt.merchantName,
      purchaseDate: receipt.purchaseDate,
      totalCents: receipt.totalCents,
      receiptNumber: receipt.receiptNumber,
      excludeReceiptId: receipt.id,
    }),
  ]);

  const lowConfidence = lowConfidenceFieldsOf(receipt);

  return (
    <div className="app-container py-6 lg:py-8">
      <header className="mb-6">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-mint-100 px-3 py-1 text-sm font-semibold text-forest-800">
          <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
          {receipt.ocrError ? 'Ready for your details' : 'Here is what we read'}
        </p>
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-forest-900 lg:text-3xl">
          Check the details before we file it
        </h1>
        <p className="mt-1 text-ink-600">
          Nothing is saved until you say so. Correct anything that looks wrong — it only takes a moment.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-6 lg:self-start">
          <DocumentViewer pages={pages} merchantName={receipt.merchantName} />
        </div>

        <ReceiptForm
          mode="review"
          receiptId={receipt.id}
          initialValues={toFormValues({
            ...receipt,
            tags: receipt.tags.map((link) => link.tag.name),
          })}
          categories={categories}
          folders={folders}
          lowConfidenceFields={lowConfidence}
          ocrFailed={Boolean(receipt.ocrError)}
          duplicates={duplicates.map((duplicate) => ({
            receiptId: duplicate.receiptId,
            merchantName: duplicate.merchantName,
            purchaseDate: duplicate.purchaseDate ? duplicate.purchaseDate.toISOString() : null,
            totalCents: duplicate.totalCents,
            currency: duplicate.currency,
            score: duplicate.score,
            explanation: duplicate.explanation,
          }))}
        />
      </div>
    </div>
  );
}
