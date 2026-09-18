import { FileKind } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getFolderTree, type FolderNode } from '@/lib/folders';
import { signedFileUrl } from '@/lib/storage/signing';
import type { DocumentPage } from '@/components/receipts/document-viewer';
import type { CategoryOption, FolderOption } from './form-values';
import { getReceiptDetail } from './service';

const PREVIEW_URL_TTL_SECONDS = 900;

/** Flattens the folder tree into `Parent › Child` labels for select inputs. */
export function flattenFolders(nodes: FolderNode[], prefix = ''): FolderOption[] {
  return nodes.flatMap((node) => {
    const label = prefix ? `${prefix} › ${node.name}` : node.name;
    return [{ id: node.id, label }, ...flattenFolders(node.children, label)];
  });
}

export async function getFolderOptions(businessId: string): Promise<FolderOption[]> {
  const tree = await getFolderTree(businessId);
  return flattenFolders(tree);
}

export async function getCategoryOptions(businessId: string): Promise<CategoryOption[]> {
  return prisma.category.findMany({
    where: { businessId, archivedAt: null },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
}

export type ReceiptDetail = NonNullable<Awaited<ReturnType<typeof getReceiptDetail>>>;

/**
 * Turns the stored files into short-lived signed URLs the browser can render.
 * Preview derivatives are used where they exist so phones do not download the
 * full-resolution original to look at a slip.
 */
export async function buildDocumentPages(receipt: ReceiptDetail, businessId: string): Promise<DocumentPage[]> {
  const originals = receipt.files.filter((file) => file.kind === FileKind.ORIGINAL);
  const previews = new Map(
    receipt.files.filter((file) => file.kind === FileKind.PREVIEW).map((file) => [file.pageNumber, file]),
  );

  return Promise.all(
    originals
      .sort((a, b) => a.pageNumber - b.pageNumber)
      .map(async (original) => {
        const preview = previews.get(original.pageNumber);
        return {
          pageNumber: original.pageNumber,
          previewUrl: preview
            ? await signedFileUrl(
                { resourceId: preview.id, resourceType: 'receipt-file', businessId },
                PREVIEW_URL_TTL_SECONDS,
              )
            : null,
          originalUrl: await signedFileUrl(
            { resourceId: original.id, resourceType: 'receipt-file', businessId },
            PREVIEW_URL_TTL_SECONDS,
          ),
          mimeType: original.mimeType,
          originalFilename: original.originalFilename,
        };
      }),
  );
}

/** Signed URL that forces a download of the original file with a tidy name. */
export async function buildOriginalDownloadUrl(
  receipt: ReceiptDetail,
  businessId: string,
  filename: string,
): Promise<string | null> {
  const original = receipt.files.find((file) => file.kind === FileKind.ORIGINAL);
  if (!original) return null;
  return signedFileUrl(
    { resourceId: original.id, resourceType: 'receipt-file', businessId, downloadFilename: filename },
    600,
  );
}

export function lowConfidenceFieldsOf(receipt: { fieldConfidence: unknown }, threshold = 0.7): string[] {
  const map = receipt.fieldConfidence;
  if (!map || typeof map !== 'object') return [];
  return Object.entries(map as Record<string, unknown>)
    .filter(([, value]) => typeof value === 'number' && value < threshold)
    .map(([key]) => key);
}
