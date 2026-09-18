import { NextResponse } from 'next/server';
import { z } from 'zod';
import { HttpError, parseJson, withWorkspace } from '@/lib/api';
import { recordAudit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { normalisePhone } from '@/lib/validation';
import { businessSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withWorkspace(async ({ session }) => {
  const business = await prisma.business.findFirst({
    where: { id: session.businessId },
    select: {
      id: true,
      name: true,
      currency: true,
      financialYearStartMonth: true,
      folderStructure: true,
      phone: true,
      vatNumber: true,
      addressLine: true,
      onboardingCompletedAt: true,
      createdAt: true,
    },
  });
  if (!business) throw new HttpError(404, 'Workspace not found.', 'not_found');
  return NextResponse.json({ business });
});

export const PATCH = withWorkspace(
  async ({ request, session }) => {
    if (session.role !== 'OWNER' && session.role !== 'ADMIN') {
      throw new HttpError(403, 'Only an owner can change business details.', 'forbidden');
    }

    const data = await parseJson(request, businessSchema.partial());

    const business = await prisma.business.update({
      where: { id: session.businessId },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.currency ? { currency: data.currency } : {}),
        ...(data.financialYearStartMonth ? { financialYearStartMonth: data.financialYearStartMonth } : {}),
        ...(data.folderStructure ? { folderStructure: data.folderStructure } : {}),
        ...(data.phone !== undefined ? { phone: data.phone ? normalisePhone(data.phone) : null } : {}),
        ...(data.vatNumber !== undefined ? { vatNumber: data.vatNumber || null } : {}),
        ...(data.addressLine !== undefined ? { addressLine: data.addressLine || null } : {}),
      },
      select: { id: true, name: true, currency: true, financialYearStartMonth: true, folderStructure: true },
    });

    await recordAudit({
      action: 'business.updated',
      entityType: 'business',
      entityId: business.id,
      businessId: business.id,
      userId: session.userId,
      metadata: { fields: Object.keys(data).join(',') },
      request,
    });

    return NextResponse.json({ business });
  },
  { allowUnonboarded: true },
);

const onboardingSchema = z.object({ completed: z.literal(true) });

/** Marks onboarding finished so the app stops routing the user back to it. */
export const POST = withWorkspace(
  async ({ request, session }) => {
    await parseJson(request, onboardingSchema);

    await prisma.business.update({
      where: { id: session.businessId },
      data: { onboardingCompletedAt: new Date() },
    });

    await recordAudit({
      action: 'business.onboarding_completed',
      entityType: 'business',
      entityId: session.businessId,
      businessId: session.businessId,
      userId: session.userId,
      request,
    });

    return NextResponse.json({ ok: true });
  },
  { allowUnonboarded: true },
);
