import { FolderKind } from '@prisma/client';
import { NextResponse } from 'next/server';
import { HttpError, parseJson, withWorkspace } from '@/lib/api';
import { recordAudit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { getFolderTree } from '@/lib/folders';
import { folderSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withWorkspace(async ({ request, session }) => {
  const url = new URL(request.url);
  const tree = await getFolderTree(session.businessId, {
    includeArchived: url.searchParams.get('includeArchived') === 'true',
    search: url.searchParams.get('search') ?? undefined,
  });
  return NextResponse.json({ folders: tree });
});

export const POST = withWorkspace(async ({ request, session }) => {
  const data = await parseJson(request, folderSchema);

  if (data.parentId) {
    const parent = await prisma.folder.findFirst({
      where: { id: data.parentId, businessId: session.businessId },
      select: { id: true },
    });
    if (!parent) throw new HttpError(422, 'That parent folder is not available.', 'invalid_parent');
  }

  const clash = await prisma.folder.findFirst({
    where: { businessId: session.businessId, parentId: data.parentId ?? null, name: data.name },
    select: { id: true },
  });
  if (clash) {
    throw new HttpError(409, 'A folder with that name already exists here.', 'duplicate_folder', {
      name: 'You already have a folder with this name.',
    });
  }

  const folder = await prisma.folder.create({
    data: {
      businessId: session.businessId,
      name: data.name,
      parentId: data.parentId ?? null,
      kind: FolderKind.CUSTOM,
      color: data.color ?? null,
      icon: data.icon ?? null,
      sortKey: data.name.toLowerCase(),
    },
  });

  await recordAudit({
    action: 'folder.created',
    entityType: 'folder',
    entityId: folder.id,
    businessId: session.businessId,
    userId: session.userId,
    request,
  });

  return NextResponse.json({ folder }, { status: 201 });
});
