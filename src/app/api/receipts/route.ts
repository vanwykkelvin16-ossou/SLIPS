import { NextResponse } from 'next/server';
import { parseQuery, withWorkspace } from '@/lib/api';
import { listReceipts } from '@/lib/receipts/service';
import { signedFileUrl } from '@/lib/storage/signing';
import { receiptQuerySchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withWorkspace(async ({ request, session }) => {
  const query = parseQuery(request, receiptQuerySchema);
  const result = await listReceipts(session.businessId, query);

  const items = await Promise.all(
    result.items.map(async (item) => ({
      ...item,
      thumbnailUrl: item.thumbnailFileId
        ? await signedFileUrl(
            { resourceId: item.thumbnailFileId, resourceType: 'receipt-file', businessId: session.businessId },
            900,
          )
        : null,
    })),
  );

  return NextResponse.json({ ...result, items });
});
