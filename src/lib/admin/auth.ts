import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { ADMIN_COOKIE, ADMIN_SESSION_TTL_SECONDS, signAdminToken, verifyAdminToken } from './session-token';

export { ADMIN_COOKIE, verifyAdminToken } from './session-token';

/**
 * Admin sessions are entirely separate from customer sessions: a different
 * cookie, a different signing key, a different table. Holding a customer
 * session grants nothing here, and holding an admin session grants no access
 * to any business workspace.
 */
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MINUTES = 15;
const BCRYPT_ROUNDS = 12;

export interface AdminSession {
  adminId: string;
  email: string;
  name: string;
  mustChangePassword: boolean;
}

export async function hashAdminPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export type AdminLoginResult =
  | { ok: true; session: AdminSession }
  | { ok: false; reason: 'invalid' | 'locked' | 'disabled' };

/**
 * Verifies credentials and, on success, sets the admin session cookie.
 * Failures are deliberately indistinguishable to the caller.
 */
export async function signInAdmin(email: string, password: string): Promise<AdminLoginResult> {
  const normalised = email.trim().toLowerCase();
  const admin = await prisma.adminUser.findUnique({ where: { email: normalised } });

  if (!admin) {
    // Same work as a real comparison so timing does not reveal valid addresses.
    await bcrypt.compare(password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin');
    return { ok: false, reason: 'invalid' };
  }

  if (!admin.isActive) return { ok: false, reason: 'disabled' };
  if (admin.lockedUntil && admin.lockedUntil > new Date()) return { ok: false, reason: 'locked' };

  const valid = await bcrypt.compare(password, admin.passwordHash);
  if (!valid) {
    const failedLogins = admin.failedLogins + 1;
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: {
        failedLogins,
        lockedUntil: failedLogins >= LOCKOUT_THRESHOLD ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : admin.lockedUntil,
      },
    });
    return { ok: false, reason: failedLogins >= LOCKOUT_THRESHOLD ? 'locked' : 'invalid' };
  }

  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  const token = await signAdminToken({ adminId: admin.id, sessionVersion: admin.sessionVersion });
  cookies().set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  });

  return {
    ok: true,
    session: {
      adminId: admin.id,
      email: admin.email,
      name: admin.name,
      mustChangePassword: admin.mustChangePassword,
    },
  };
}

export function signOutAdmin(): void {
  cookies().set(ADMIN_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
}

/**
 * Resolves the current admin, re-checking the token against the database so a
 * disabled account or a password change invalidates existing sessions at once.
 */
export const getAdminSession = cache(async (): Promise<AdminSession | null> => {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  if (!token) return null;

  const claims = await verifyAdminToken(token);
  if (!claims) return null;

  const admin = await prisma.adminUser.findUnique({
    where: { id: claims.adminId },
    select: { id: true, email: true, name: true, isActive: true, sessionVersion: true, mustChangePassword: true },
  });

  if (!admin || !admin.isActive) return null;
  if (admin.sessionVersion !== claims.sessionVersion) return null;

  return {
    adminId: admin.id,
    email: admin.email,
    name: admin.name,
    mustChangePassword: admin.mustChangePassword,
  };
});

/** For admin pages: redirects to the admin sign-in page when not authorised. */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) redirect('/admin/login');
  return session;
}

/** Changes an admin password and signs every admin session out. */
export async function changeAdminPassword(adminId: string, currentPassword: string, newPassword: string): Promise<boolean> {
  const admin = await prisma.adminUser.findUnique({ where: { id: adminId }, select: { id: true, passwordHash: true } });
  if (!admin) return false;

  const valid = await bcrypt.compare(currentPassword, admin.passwordHash);
  if (!valid) return false;

  await prisma.adminUser.update({
    where: { id: admin.id },
    data: {
      passwordHash: await hashAdminPassword(newPassword),
      mustChangePassword: false,
      sessionVersion: { increment: 1 },
      failedLogins: 0,
      lockedUntil: null,
    },
  });

  signOutAdmin();
  return true;
}
