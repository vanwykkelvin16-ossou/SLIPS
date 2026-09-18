import { FolderKind, type FolderStructure, type Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export const UNFILED_FOLDER_NAME = 'Unfiled';
export const NEEDS_REVIEW_FOLDER_NAME = 'Needs review';

type Tx = Prisma.TransactionClient | typeof prisma;

/**
 * The two always-present system folders. Created once per workspace and never
 * deleted, so a slip always has somewhere to live.
 */
export async function ensureSystemFolders(businessId: string, tx: Tx = prisma) {
  const unfiled = await upsertFolder(tx, businessId, {
    name: UNFILED_FOLDER_NAME,
    kind: FolderKind.UNFILED,
    parentId: null,
    icon: 'inbox',
    color: '#8A9A91',
    sortKey: 'zzz-1',
  });
  const needsReview = await upsertFolder(tx, businessId, {
    name: NEEDS_REVIEW_FOLDER_NAME,
    kind: FolderKind.NEEDS_REVIEW,
    parentId: null,
    icon: 'alert-circle',
    color: '#D9902B',
    sortKey: 'zzz-2',
  });
  return { unfiled, needsReview };
}

/**
 * Returns the folder a slip dated `date` belongs in, creating the year and
 * month folders on demand. Folders appear as the user files slips rather than
 * being pre-created for empty months.
 */
export async function ensureDateFolder(
  businessId: string,
  date: Date,
  structure: FolderStructure,
  categoryName: string | null,
  tx: Tx = prisma,
): Promise<string> {
  const year = date.getUTCFullYear();
  const monthIndex = date.getUTCMonth();
  const monthName = MONTH_NAMES[monthIndex] ?? 'January';

  if (structure === 'CATEGORY_ONLY') {
    const name = categoryName ?? 'Uncategorised';
    const folder = await upsertFolder(tx, businessId, {
      name,
      kind: FolderKind.CATEGORY,
      parentId: null,
      icon: 'tag',
      sortKey: name.toLowerCase(),
    });
    return folder.id;
  }

  const yearFolder = await upsertFolder(tx, businessId, {
    name: String(year),
    kind: FolderKind.YEAR,
    parentId: null,
    icon: 'calendar',
    sortKey: String(year),
  });

  const monthFolder = await upsertFolder(tx, businessId, {
    name: monthName,
    kind: FolderKind.MONTH,
    parentId: yearFolder.id,
    icon: 'calendar-days',
    sortKey: `${year}-${String(monthIndex + 1).padStart(2, '0')}`,
  });

  if (structure === 'YEAR_MONTH_CATEGORY' && categoryName) {
    const categoryFolder = await upsertFolder(tx, businessId, {
      name: categoryName,
      kind: FolderKind.CATEGORY,
      parentId: monthFolder.id,
      icon: 'tag',
      sortKey: `${year}-${String(monthIndex + 1).padStart(2, '0')}-${categoryName.toLowerCase()}`,
    });
    return categoryFolder.id;
  }

  return monthFolder.id;
}

/**
 * Suggests where a slip should be filed. The user always sees the suggestion on
 * the review screen and can override it.
 */
export async function suggestFolderId(
  businessId: string,
  options: { purchaseDate: Date | null; categoryName: string | null; structure: FolderStructure; needsReview: boolean },
  tx: Tx = prisma,
): Promise<string> {
  const { unfiled, needsReview } = await ensureSystemFolders(businessId, tx);

  if (!options.purchaseDate) {
    return options.needsReview ? needsReview.id : unfiled.id;
  }

  return ensureDateFolder(businessId, options.purchaseDate, options.structure, options.categoryName, tx);
}

async function upsertFolder(
  tx: Tx,
  businessId: string,
  data: { name: string; kind: FolderKind; parentId: string | null; icon?: string; color?: string; sortKey?: string },
) {
  const existing = await tx.folder.findFirst({
    where: { businessId, parentId: data.parentId, name: data.name },
    select: { id: true, name: true, kind: true, parentId: true },
  });
  if (existing) return existing;

  try {
    return await tx.folder.create({
      data: {
        businessId,
        name: data.name,
        kind: data.kind,
        parentId: data.parentId,
        icon: data.icon ?? null,
        color: data.color ?? null,
        sortKey: data.sortKey ?? data.name.toLowerCase(),
      },
      select: { id: true, name: true, kind: true, parentId: true },
    });
  } catch {
    // Lost a race with a concurrent upload: re-read the winner's row.
    const raced = await tx.folder.findFirst({
      where: { businessId, parentId: data.parentId, name: data.name },
      select: { id: true, name: true, kind: true, parentId: true },
    });
    if (raced) return raced;
    throw new Error(`Could not create folder "${data.name}"`);
  }
}

export interface FolderNode {
  id: string;
  name: string;
  kind: FolderKind;
  color: string | null;
  icon: string | null;
  sortKey: string | null;
  archivedAt: Date | null;
  parentId: string | null;
  receiptCount: number;
  /** Includes slips filed in descendant folders. */
  totalCount: number;
  children: FolderNode[];
}

/** Full folder tree with per-folder and rolled-up slip counts. */
export async function getFolderTree(
  businessId: string,
  options: { includeArchived?: boolean; search?: string } = {},
): Promise<FolderNode[]> {
  const [folders, counts] = await Promise.all([
    prisma.folder.findMany({
      where: {
        businessId,
        ...(options.includeArchived ? {} : { archivedAt: null }),
      },
      orderBy: [{ sortKey: 'desc' }, { name: 'asc' }],
    }),
    prisma.receipt.groupBy({
      by: ['folderId'],
      where: { businessId, deletedAt: null },
      _count: { _all: true },
    }),
  ]);

  const countByFolder = new Map<string, number>();
  for (const row of counts) {
    if (row.folderId) countByFolder.set(row.folderId, row._count._all);
  }

  const nodes = new Map<string, FolderNode>();
  for (const folder of folders) {
    nodes.set(folder.id, {
      id: folder.id,
      name: folder.name,
      kind: folder.kind,
      color: folder.color,
      icon: folder.icon,
      sortKey: folder.sortKey,
      archivedAt: folder.archivedAt,
      parentId: folder.parentId,
      receiptCount: countByFolder.get(folder.id) ?? 0,
      totalCount: countByFolder.get(folder.id) ?? 0,
      children: [],
    });
  }

  const roots: FolderNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const rollUp = (node: FolderNode): number => {
    node.totalCount = node.receiptCount + node.children.reduce((sum, child) => sum + rollUp(child), 0);
    return node.totalCount;
  };
  roots.forEach(rollUp);

  const sortNodes = (list: FolderNode[]) => {
    list.sort((a, b) => {
      const kindRank = (kind: FolderKind) => (kind === FolderKind.YEAR ? 0 : kind === FolderKind.MONTH ? 1 : kind === FolderKind.CUSTOM ? 2 : 3);
      if (kindRank(a.kind) !== kindRank(b.kind)) return kindRank(a.kind) - kindRank(b.kind);
      if (a.sortKey && b.sortKey && a.sortKey !== b.sortKey) return b.sortKey.localeCompare(a.sortKey);
      return a.name.localeCompare(b.name);
    });
    list.forEach((node) => sortNodes(node.children));
  };
  sortNodes(roots);

  if (options.search?.trim()) {
    const term = options.search.trim().toLowerCase();
    const matches = (node: FolderNode): FolderNode | null => {
      const children = node.children.map(matches).filter((child): child is FolderNode => child !== null);
      if (node.name.toLowerCase().includes(term) || children.length) return { ...node, children };
      return null;
    };
    return roots.map(matches).filter((node): node is FolderNode => node !== null);
  }

  return roots;
}

/** All descendant folder ids (inclusive) — used when exporting or filtering by folder. */
export async function folderIdsWithDescendants(businessId: string, folderId: string): Promise<string[]> {
  const all = await prisma.folder.findMany({ where: { businessId }, select: { id: true, parentId: true } });
  const childrenByParent = new Map<string, string[]>();
  for (const folder of all) {
    if (!folder.parentId) continue;
    const list = childrenByParent.get(folder.parentId) ?? [];
    list.push(folder.id);
    childrenByParent.set(folder.parentId, list);
  }

  const result: string[] = [];
  const stack = [folderId];
  const seen = new Set<string>();
  while (stack.length) {
    const current = stack.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    result.push(current);
    stack.push(...(childrenByParent.get(current) ?? []));
  }
  return result;
}

/**
 * Financial-year label for a date, honouring the workspace's financial year
 * start month. A March start means 1 March 2026 – 28 February 2027 is "FY2026/27".
 */
export function financialYearLabel(date: Date, startMonth: number): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  if (startMonth === 1) return `FY${year}`;
  const startYear = month >= startMonth ? year : year - 1;
  const endYear = String(startYear + 1).slice(-2);
  return `FY${startYear}/${endYear}`;
}

export function financialYearRange(date: Date, startMonth: number): { start: Date; end: Date } {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const startYear = month >= startMonth ? year : year - 1;
  const start = new Date(Date.UTC(startYear, startMonth - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(startYear + 1, startMonth - 1, 1, 0, 0, 0) - 1);
  return { start, end };
}
