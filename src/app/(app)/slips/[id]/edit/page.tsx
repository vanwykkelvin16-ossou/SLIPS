import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DocumentViewer } from '@/components/receipts/document-viewer';
import { ReceiptForm } from '@/components/receipts/receipt-form';
import { toFormValues } from '@/lib/receipts/form-values';
import { getReceiptDetail } from '@/lib/receipts/service';
import {
  buildDocumentPages,
  getCategoryOptions,
  getFolderOptions,
  lowConfidenceFieldsOf,
} from '@/lib/receipts/view-model';
import { requireOnboardedWorkspace } from '@/lib/session';

export const metadata: Metadata = { title: 'Edit slip' };
export const dynamic = 'force-dynamic';

export default async function EditSlipPage({ params }: { params: { id: string } }) {
  const session = await requireOnboardedWorkspace();
  const receipt = await getReceiptDetail(session.businessId, params.id);
  if (!receipt || receipt.deletedAt) notFound();

  const [pages, categories, folders] = await Promise.all([
    buildDocumentPages(receipt, session.businessId),
    getCategoryOptions(session.businessId),
    getFolderOptions(session.businessId),
  ]);

  return (
    <div className="app-container py-6 lg:py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-forest-900 lg:text-3xl">Edit this slip</h1>
        <p className="mt-1 text-ink-600">Change anything that is not quite right. The original document stays as it is.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-6 lg:self-start">
          <DocumentViewer pages={pages} merchantName={receipt.merchantName} />
        </div>

        <ReceiptForm
          mode="edit"
          receiptId={receipt.id}
          initialValues={toFormValues({ ...receipt, tags: receipt.tags.map((link) => link.tag.name) })}
          categories={categories}
          folders={folders}
          lowConfidenceFields={receipt.status === 'NEEDS_REVIEW' ? lowConfidenceFieldsOf(receipt) : []}
        />
      </div>
    </div>
  );
}
