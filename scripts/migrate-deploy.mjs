/**
 * Applies outstanding migrations as part of the build.
 *
 * Vercel has no boot step, so this is the only place migrations can run
 * automatically. Two details matter:
 *
 *  - Migrations must not go through a connection pooler. If DIRECT_URL is set
 *    it is used instead of DATABASE_URL, which is what Neon, Supabase and
 *    Vercel Postgres all want.
 *  - With no database configured at all, the build is a plain compile (CI, a
 *    local `npm run build`), so this skips rather than fails.
 */
import { spawnSync } from 'node:child_process';

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!url) {
  console.info('[migrate] no DATABASE_URL set — skipping migrations for this build');
  process.exit(0);
}

console.info(`[migrate] applying migrations via ${process.env.DIRECT_URL ? 'DIRECT_URL' : 'DATABASE_URL'}`);

const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: url },
});

if (result.status !== 0) {
  console.error('[migrate] migrations failed — the deployment would serve a database that does not match the code');
  process.exit(result.status ?? 1);
}

/*
 * Seed the administrator in the same step, for the same reason: there is no
 * boot step to do it on. The seed leaves an existing administrator's password
 * alone, so this is safe on every deploy.
 */
if (process.env.ADMIN_EMAIL && process.env.ADMIN_INITIAL_PASSWORD) {
  console.info('[migrate] seeding the administrator');
  const seed = spawnSync('npx', ['tsx', 'prisma/seed-admin.ts'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  });
  if (seed.status !== 0) {
    console.error('[migrate] seeding the administrator failed');
    process.exit(seed.status ?? 1);
  }
} else {
  console.info('[migrate] ADMIN_EMAIL / ADMIN_INITIAL_PASSWORD not set — skipping the admin seed');
}
