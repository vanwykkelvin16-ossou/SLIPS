import { NextResponse } from 'next/server';
import { notFound, parseJson, withWorkspace } from '@/lib/api';
import { recordAudit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { categorySchema } from '@/lib/validation';

export const runtime = 'nodejs';

export const PATCH = withWorkspace<{ id: string }>(async ({ request, session, params }) => {
  const data = await parseJson(request, categorySchema.partial());

  const category = await prisma.category.findFirst({
    where: { id: params.id, businessId: session.businessId },
    select: { id: true },
  });
  if (!category) return notFound('That category');

  const updated = await prisma.category.update({
    where: { id: category.id },
    data: { ...(data.name ? { name: data.name } : {}), ...(data.color !== undefined ? { color: data.color } : {}) },
  });

  await recordAudit({
    action: 'category.updated',
    entityType: 'category',
    entityId: category.id,
    businessId: session.businessId,
    userId: session.userId,
    request,
  });

  return NextResponse.json({ category: updated });
});

/**
 * Archives rather than deletes: slips already filed under this category keep
 * their history, they just stop being offered for new ones.
 */
export const DELETE = withWorkspace<{ id: string }>(async ({ request, session, params }) => {
  const category = await prisma.category.findFirst({
    where: { id: params.id, businessId: session.businessId },
    select: { id: true },
  });
  if (!category) return notFound('That category');

  const inUse = await prisma.receipt.count({
    where: { businessId: session.businessId, categoryId: category.id, deletedAt: null },
  });

  await prisma.category.update({ where: { id: category.id }, data: { archivedAt: new Date() } });

  await recordAudit({
    action: 'category.deleted',
    entityType: 'category',
    entityId: category.id,
    businessId: session.businessId,
    userId: session.userId,
    metadata: { slipsUsingIt: inUse },
    request,
  });

  return NextResponse.json({ ok: true, slipsUsingIt: inUse });
});
