import type { Metadata } from 'next';
import { FolderManager, type FolderTreeNode } from '@/components/folders/folder-manager';
import { getFolderTree, type FolderNode } from '@/lib/folders';
import { flattenFolders } from '@/lib/receipts/view-model';
import { requireOnboardedWorkspace } from '@/lib/session';

export const metadata: Metadata = { title: 'Folders' };
export const dynamic = 'force-dynamic';

const SYSTEM_KINDS = new Set(['YEAR', 'MONTH', 'UNFILED', 'NEEDS_REVIEW', 'FINANCIAL_YEAR']);

function toTreeNode(node: FolderNode): FolderTreeNode {
  return {
    id: node.id,
    name: node.name,
    kind: node.kind,
    color: node.color,
    icon: node.icon,
    archived: node.archivedAt !== null,
    isSystem: SYSTEM_KINDS.has(node.kind),
    canDelete: node.kind === 'CUSTOM',
    receiptCount: node.receiptCount,
    totalCount: node.totalCount,
    children: node.children.map(toTreeNode),
  };
}

export default async function FoldersPage() {
  const session = await requireOnboardedWorkspace();
  const tree = await getFolderTree(session.businessId, { includeArchived: true });

  return (
    <div className="app-container py-6 lg:py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-extrabold tracking-tight text-forest-900 lg:text-3xl">Folders</h1>
        <p className="mt-1 text-ink-600">
          Slips file themselves by year and month. Add your own folders whenever it helps.
        </p>
      </header>

      <FolderManager folders={tree.map(toTreeNode)} parentOptions={flattenFolders(tree)} />
    </div>
  );
}
