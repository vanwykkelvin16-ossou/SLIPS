/**
 * Creates (or updates) the initial administrator account for the admin portal.
 *
 *   npm run seed:admin
 *
 * Credentials come from the environment and only a bcrypt hash is stored —
 * the password is never written to the database, the repository or any log.
 *
 *   ADMIN_EMAIL=you@example.co.za
 *   ADMIN_INITIAL_PASSWORD=<a strong password>
 *   ADMIN_NAME="Your Name"          # optional
 *
 * Running it again on an existing account leaves the password alone unless
 * ADMIN_FORCE_PASSWORD_RESET=true, so it is safe to run on every deploy.
 */
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BCRYPT_ROUNDS = 12;

function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(local.length - 2, 1))}@${domain}`;
}

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_INITIAL_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || 'Administrator';
  const forceReset = process.env.ADMIN_FORCE_PASSWORD_RESET === 'true';

  if (!email || !password) {
    console.error('[seed-admin] ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD must both be set. Nothing was changed.');
    process.exitCode = 1;
    return;
  }

  if (password.length < 8) {
    console.error('[seed-admin] ADMIN_INITIAL_PASSWORD is too short. Nothing was changed.');
    process.exitCode = 1;
    return;
  }

  const existing = await prisma.adminUser.findUnique({ where: { email }, select: { id: true } });

  if (existing && !forceReset) {
    await prisma.adminUser.update({ where: { email }, data: { name, isActive: true } });
    console.info(`[seed-admin] Administrator ${maskEmail(email)} already exists — password left unchanged.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  await prisma.adminUser.upsert({
    where: { email },
    create: { email, passwordHash, name, mustChangePassword: true },
    update: { passwordHash, name, isActive: true, mustChangePassword: true, failedLogins: 0, lockedUntil: null, sessionVersion: { increment: 1 } },
  });

  console.info(
    `[seed-admin] Administrator ${maskEmail(email)} is ready. Sign in at /admin/login and change the password straight away.`,
  );
}

main()
  .catch((error) => {
    console.error('[seed-admin] failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
