import { NextResponse } from 'next/server';
import { z } from 'zod';
import { hashPassword, verifyPassword } from '@/lib/accounts';
import { HttpError, parseJson, withWorkspace } from '@/lib/api';
import { recordAudit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { passwordChangedEmail } from '@/lib/email/templates';
import { changePasswordSchema, profileSchema } from '@/lib/validation';

export const runtime = 'nodejs';

export const GET = withWorkspace(
  async ({ session }) => {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        emailVerifiedAt: true,
        notifyByEmail: true,
        notifyOnExport: true,
        notifyMonthly: true,
        createdAt: true,
      },
    });
    if (!user) throw new HttpError(404, 'Account not found.', 'not_found');
    return NextResponse.json({ user });
  },
  { allowUnonboarded: true },
);

export const PATCH = withWorkspace(
  async ({ request, session }) => {
    const data = await parseJson(request, profileSchema.partial());

    if (data.email) {
      const clash = await prisma.user.findFirst({
        where: { email: data.email, id: { not: session.userId } },
        select: { id: true },
      });
      if (clash) {
        throw new HttpError(409, 'That e-mail address is already in use.', 'email_taken', {
          email: 'Another account already uses that address.',
        });
      }
    }

    const current = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { email: true },
    });

    const emailChanged = Boolean(data.email && data.email !== current?.email);

    const user = await prisma.user.update({
      where: { id: session.userId },
      data: {
        ...(data.firstName ? { firstName: data.firstName } : {}),
        ...(data.lastName !== undefined ? { lastName: data.lastName || null } : {}),
        ...(data.phone ? { phone: data.phone } : {}),
        // A new address must be confirmed again before it is trusted.
        ...(data.email ? { email: data.email, ...(emailChanged ? { emailVerifiedAt: null } : {}) } : {}),
        ...(data.notifyByEmail !== undefined ? { notifyByEmail: data.notifyByEmail } : {}),
        ...(data.notifyOnExport !== undefined ? { notifyOnExport: data.notifyOnExport } : {}),
        ...(data.notifyMonthly !== undefined ? { notifyMonthly: data.notifyMonthly } : {}),
      },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, emailVerifiedAt: true },
    });

    if (emailChanged) {
      const { sendVerificationEmail } = await import('@/lib/accounts');
      await sendVerificationEmail(user.id).catch(() => undefined);
    }

    await recordAudit({
      action: 'user.profile_updated',
      entityType: 'user',
      entityId: session.userId,
      businessId: session.businessId,
      userId: session.userId,
      metadata: { fields: Object.keys(data).join(','), emailChanged },
      request,
    });

    return NextResponse.json({ user, emailChanged });
  },
  { allowUnonboarded: true },
);

/** Password change. Requires the current password and signs other devices out. */
export const PUT = withWorkspace(
  async ({ request, session }) => {
    const data = await parseJson(request, changePasswordSchema);

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, passwordHash: true, email: true, firstName: true },
    });
    if (!user) throw new HttpError(404, 'Account not found.', 'not_found');

    const valid = await verifyPassword(data.currentPassword, user.passwordHash);
    if (!valid) {
      throw new HttpError(422, 'That is not your current password.', 'invalid_password', {
        currentPassword: 'That is not your current password.',
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(data.password),
        sessionVersion: { increment: 1 },
        failedLogins: 0,
        lockedUntil: null,
      },
    });

    await sendEmail(passwordChangedEmail(user.email, user.firstName)).catch(() => undefined);

    await recordAudit({
      action: 'user.password_changed',
      entityType: 'user',
      entityId: user.id,
      businessId: session.businessId,
      userId: user.id,
      request,
    });

    // The caller's own token is now stale too, so the client must sign in again.
    return NextResponse.json({ ok: true, signOutRequired: true });
  },
  { allowUnonboarded: true },
);

const deleteSchema = z.object({
  password: z.string().min(1, 'Enter your password to confirm'),
  confirmation: z.literal('DELETE', {
    errorMap: () => ({ message: 'Type DELETE to confirm' }),
  }),
});

/**
 * Deletes the account, its workspace and every stored document.
 * Re-authentication is required — this cannot be undone.
 */
export const DELETE = withWorkspace(
  async ({ request, session }) => {
    const data = await parseJson(request, deleteSchema);

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, passwordHash: true },
    });
    if (!user) throw new HttpError(404, 'Account not found.', 'not_found');

    const valid = await verifyPassword(data.password, user.passwordHash);
    if (!valid) {
      throw new HttpError(422, 'That password is not right.', 'invalid_password', {
        password: 'That password is not right.',
      });
    }

    if (session.role !== 'OWNER') {
      throw new HttpError(403, 'Only the owner can delete this workspace.', 'forbidden');
    }

    const files = await prisma.receiptFile.findMany({
      where: { businessId: session.businessId },
      select: { storageKey: true },
    });
    const exports = await prisma.exportJob.findMany({
      where: { businessId: session.businessId, storageKey: { not: null } },
      select: { storageKey: true },
    });

    const { getStorage } = await import('@/lib/storage');
    const storage = getStorage();
    for (const file of [...files, ...exports]) {
      if (file.storageKey) await storage.delete(file.storageKey).catch(() => undefined);
    }

    await recordAudit({
      action: 'user.account_deleted',
      entityType: 'user',
      entityId: session.userId,
      businessId: null,
      userId: null,
      metadata: { documentsRemoved: files.length },
      request,
    });

    // Cascades remove the business, receipts, folders, categories and tokens.
    await prisma.user.delete({ where: { id: session.userId } });

    return NextResponse.json({ ok: true });
  },
  { allowUnonboarded: true },
);
