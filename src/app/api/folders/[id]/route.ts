import { FolderKind } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { HttpError, notFound, parseJson, withWorkspace } from '@/lib/api';
import { recordAudit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { ensureSystemFolders, folderIdsWithDescendants } from '@/lib/folders';
import { folderSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const patchSchema = folderSchema.partial().extend({
  archived: z.boolean().optional(),
});

export const PATCH = withWorkspace<{ id: string }>(async ({ request, session, params }) => {
  const data = await parseJson(request, patchSchema);

  const folder = await prisma.folder.findFirst({
    where: { id: params.id, businessId: session.businessId },
    select: { id: true, kind: true, parentId: true, name: true },
  });
  if (!folder) return notFound('That folder');

  const isSystem = folder.kind === FolderKind.UNFILED || folder.kind === FolderKind.NEEDS_REVIEW;
  if (isSystem && (data.name || data.archived)) {
    throw new HttpError(422, 'Built-in folders cannot be renamed or archived.', 'system_folder');
  }

  if (data.name && data.name !== folder.name) {
    const clash = await prisma.folder.findFirst({
      where: { businessId: session.businessId, parentId: folder.parentId, name: data.name, id: { not: folder.id } },
      select: { id: true },
    });
    if (clash) {
      throw new HttpError(409, 'A folder with that name already exists here.', 'duplicate_folder', {
        name: 'You already have a folder with this name.',
      });
    }
  }

  const updated = await prisma.folder.update({
    where: { id: folder.id },
    data: {
      ...(data.name ? { name: data.name, sortKey: folder.kind === FolderKind.CUSTOM ? data.name.toLowerCase() : undefined } : {}),
      ...(data.color !== undefined ? { color: data.color } : {}),
      ...(data.icon !== undefined ? { icon: data.icon } : {}),
      ...(data.archived !== undefined ? { archivedAt: data.archived ? new Date() : null } : {}),
    },
  });

  await recordAudit({
    action: data.archived !== undefined ? 'folder.archived' : 'folder.updated',
    entityType: 'folder',
    entityId: folder.id,
    businessId: session.businessId,
    userId: session.userId,
    request,
  });

  return NextResponse.json({ folder: updated });
});

/**
 * Deletes a custom folder. Slips are never deleted with it — they move to
 * Unfiled so nothing can be lost by tidying up.
 */
export const DELETE = withWorkspace<{ id: string }>(async ({ request, session, params }) => {
  const folder = await prisma.folder.findFirst({
    where: { id: params.id, businessId: session.businessId },
    select: { id: true, kind: true },
  });
  if (!folder) return notFound('That folder');

  if (folder.kind !== FolderKind.CUSTOM) {
    throw new HttpError(
      422,
      'Automatic folders cannot be deleted. You can archive a folder instead.',
      'system_folder',
    );
  }

  const ids = await folderIdsWithDescendants(session.businessId, folder.id);
  const { unfiled } = await ensureSystemFolders(session.businessId);

  const moved = await prisma.receipt.updateMany({
    where: { businessId: session.businessId, folderId: { in: ids } },
    data: { folderId: unfiled.id },
  });

  await prisma.folder.delete({ where: { id: folder.id } });

  await recordAudit({
    action: 'folder.deleted',
    entityType: 'folder',
    entityId: folder.id,
    businessId: session.businessId,
    userId: session.userId,
    metadata: { movedToUnfiled: moved.count },
    request,
  });

  return NextResponse.json({ ok: true, movedToUnfiled: moved.count });
});
