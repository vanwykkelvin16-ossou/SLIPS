import bcrypt from 'bcryptjs';
import { BusinessRole } from '@prisma/client';
import { defaultCategories, defaultCurrency } from '@/config/brand';
import { prisma } from '@/lib/db';
import { createToken, VERIFICATION_TOKEN_TTL_MS } from '@/lib/auth-tokens';
import { sendEmail } from '@/lib/email';
import { verificationEmail } from '@/lib/email/templates';
import { getAppUrl } from '@/lib/env';
import { ensureSystemFolders } from '@/lib/folders';

const BCRYPT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface CreateAccountInput {
  firstName: string;
  businessName: string;
  phone: string;
  email: string;
  password: string;
}

export class EmailTakenError extends Error {
  constructor() {
    super('An account with that e-mail address already exists.');
  }
}

/**
 * Creates the user, their business workspace, the default categories and the
 * system folders in one transaction — a half-created workspace is never left
 * behind if anything fails.
 */
export async function createAccount(input: CreateAccountInput): Promise<{ userId: string; businessId: string }> {
  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) throw new EmailTakenError();

  const passwordHash = await hashPassword(input.password);
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        phone: input.phone,
        termsAcceptedAt: now,
      },
      select: { id: true },
    });

    const business = await tx.business.create({
      data: {
        name: input.businessName,
        ownerUserId: user.id,
        currency: defaultCurrency,
        phone: input.phone,
      },
      select: { id: true },
    });

    await tx.businessMember.create({
      data: { businessId: business.id, userId: user.id, role: BusinessRole.OWNER },
    });

    await tx.category.createMany({
      data: defaultCategories.map((name) => ({ businessId: business.id, name, isDefault: true })),
    });

    await ensureSystemFolders(business.id, tx);

    return { userId: user.id, businessId: business.id };
  });

  return result;
}

/** Issues a fresh verification token and e-mails the link. */
export async function sendVerificationEmail(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, firstName: true, emailVerifiedAt: true },
  });
  if (!user || user.emailVerifiedAt) return;

  const { token, tokenHash } = createToken();

  await prisma.$transaction([
    prisma.emailVerificationToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.emailVerificationToken.create({
      data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS) },
    }),
  ]);

  const url = `${getAppUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  await sendEmail(verificationEmail(user.email, user.firstName, url));
}
