import { NextResponse } from 'next/server';
import { HttpError, parseJson, withWorkspace } from '@/lib/api';
import { recordAudit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { categorySchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withWorkspace(async ({ session }) => {
  const categories = await prisma.category.findMany({
    where: { businessId: session.businessId, archivedAt: null },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, color: true, isDefault: true },
  });
  return NextResponse.json({ categories });
});

export const POST = withWorkspace(async ({ request, session }) => {
  const data = await parseJson(request, categorySchema);

  const existing = await prisma.category.findFirst({
    where: { businessId: session.businessId, name: data.name },
    select: { id: true, archivedAt: true },
  });

  if (existing) {
    if (!existing.archivedAt) {
      throw new HttpError(409, 'You already have that category.', 'duplicate_category', {
        name: 'That category already exists.',
      });
    }
    const restored = await prisma.category.update({ where: { id: existing.id }, data: { archivedAt: null } });
    return NextResponse.json({ category: restored }, { status: 200 });
  }

  const category = await prisma.category.create({
    data: { businessId: session.businessId, name: data.name, color: data.color ?? null },
  });

  await recordAudit({
    action: 'category.created',
    entityType: 'category',
    entityId: category.id,
    businessId: session.businessId,
    userId: session.userId,
    request,
  });

  return NextResponse.json({ category }, { status: 201 });
});
