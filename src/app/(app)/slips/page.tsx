import type { Metadata } from 'next';
import { ButtonLink } from '@/components/ui/button';
import { Camera } from 'lucide-react';
import { SlipsBrowser } from '@/components/receipts/slips-browser';
import { listReceipts } from '@/lib/receipts/service';
import { getCategoryOptions, getFolderOptions } from '@/lib/receipts/view-model';
import { requireOnboardedWorkspace } from '@/lib/session';
import { signedFileUrl } from '@/lib/storage/signing';
import { receiptQuerySchema } from '@/lib/validation';

export const metadata: Metadata = { title: 'My Slips' };
export const dynamic = 'force-dynamic';

export default async function SlipsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const session = await requireOnboardedWorkspace();

  const raw = Object.fromEntries(
    Object.entries(searchParams)
      .map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])
      .filter(([, value]) => value !== undefined && value !== ''),
  );

  // Invalid filters in a shared link fall back to defaults instead of erroring.
  const parsed = receiptQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : receiptQuerySchema.parse({});

  const [result, folders, categories] = await Promise.all([
    listReceipts(session.businessId, query),
    getFolderOptions(session.businessId),
    getCategoryOptions(session.businessId),
  ]);

  const items = await Promise.all(
    result.items.map(async (item) => ({
      id: item.id,
      merchantName: item.merchantName,
      purchaseDate: item.purchaseDate ? item.purchaseDate.toISOString() : null,
      totalCents: item.totalCents,
      currency: item.currency,
      status: item.status,
      categoryName: item.categoryName,
      folderName: item.folderName,
      hasPdf: item.hasPdf,
      thumbnailUrl: item.thumbnailFileId
        ? await signedFileUrl(
            { resourceId: item.thumbnailFileId, resourceType: 'receipt-file', businessId: session.businessId },
            900,
          )
        : null,
    })),
  );

  return (
    <div className="app-container py-6 lg:py-8">
      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-forest-900 lg:text-3xl">My Slips</h1>
          <p className="mt-1 text-ink-600">Everything you have filed, ready to search.</p>
        </div>
        <ButtonLink href="/scan" icon={<Camera className="h-4 w-4" />} className="shrink-0">
          Scan a slip
        </ButtonLink>
      </header>

      <SlipsBrowser
        items={items}
        total={result.total}
        page={result.page}
        pageCount={result.pageCount}
        sumCents={result.sumCents}
        currency={session.currency}
        folders={folders}
        categories={categories}
        filters={{
          search: query.search ?? '',
          folderId: query.folderId ?? '',
          categoryId: query.categoryId ?? '',
          status: query.status ?? '',
          from: query.from ?? '',
          to: query.to ?? '',
          minAmount: query.minAmount ?? '',
          maxAmount: query.maxAmount ?? '',
          tag: query.tag ?? '',
          sort: query.sort,
          view: query.view,
        }}
      />
    </div>
  );
}
