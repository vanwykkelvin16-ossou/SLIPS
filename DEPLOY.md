# Deploying Slipsy to Vercel

Everything below is required. Vercel runs the app as serverless functions,
which the app now handles — but not with the default settings.

Once these are in place a deploy is fully automatic: the build applies database
migrations, seeds the administrator, and the cron drives exports.

---

## 1. A Postgres database

Vercel Postgres, Neon and Supabase all work. Take **two** connection strings:

| Variable | Which string |
| --- | --- |
| `DATABASE_URL` | the **pooled** one — used by the running app |
| `DIRECT_URL` | the **direct**, non-pooled one — used for migrations |

If your provider gives only one string, set both to it.

## 2. An S3 bucket — not optional

Each serverless invocation gets its own throwaway filesystem, so the local
storage driver would appear to work and then lose every slip. The app refuses
to start with it on Vercel rather than lose documents quietly.

Use Cloudflare R2, Backblaze B2 or AWS S3. **Block all public access** on the
bucket — slips are served only through short-lived signed URLs.

## 3. Environment variables

Set these in **Project → Settings → Environment Variables**, for Production
(and Preview if you use it).

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | pooled Postgres string |
| `DIRECT_URL` | direct Postgres string |
| `AUTH_SECRET` | `openssl rand -base64 48` |
| `FILE_SIGNING_SECRET` | a **different** `openssl rand -base64 48` |
| `CRON_SECRET` | `openssl rand -base64 32` |
| `NEXT_PUBLIC_APP_URL` | your full URL, **including `https://`** |
| `AUTH_URL` | the same full URL |
| `STORAGE_DRIVER` | `s3` |
| `S3_BUCKET`, `S3_REGION` | your bucket's name and region |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | its credentials |
| `S3_ENDPOINT` | R2/B2 only — their S3-compatible endpoint |
| `ADMIN_EMAIL` | the admin account's address |
| `ADMIN_INITIAL_PASSWORD` | a strong password — **not** the e-mail address |

> **`NEXT_PUBLIC_APP_URL` must include the scheme.** A bare hostname is
> accepted and assumed to be `https://`, but write it in full. On the first
> deploy you do not know the URL yet: leave both URL variables unset, deploy,
> then set them to the assigned address and redeploy.

For real password-reset e-mail, also set `EMAIL_PROVIDER=smtp` with
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` and `EMAIL_FROM`. Left
as `console`, those links are printed to the function log instead of sent —
usable for testing, not for customers.

## 4. Deploy

Import the repository at [vercel.com/new](https://vercel.com/new) and deploy.
The build runs `prisma generate`, applies migrations, seeds the administrator,
then compiles. Nothing to run by hand.

## 5. Plan, OCR and upload limits

The five-minute export cron in `vercel.json` requires Vercel Pro or Enterprise.
Hobby permits only daily cron jobs and rejects this schedule at deployment.
Do not change it to daily unless you accept delayed exports or arrange a separate
scheduler. See [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

With Fluid Compute enabled, Hobby supports up to 300 seconds per invocation;
the configured OCR route uses 120 seconds and the export worker uses 300.
Older compute settings have different limits. Cloud OCR is optional, and does
not remove the cron plan requirement.

Tesseract language data is included in the function bundle. On Vercel, leave
`OCR_CACHE_PATH` unset (the app uses `/tmp/.tesseract-cache`), or explicitly
set it to `/tmp/.tesseract-cache`. Do not copy the local cache path from the
example environment into production.

The current upload endpoint accepts multipart files through a Vercel Function.
Vercel limits the **entire request and response body to 4.5 MB**, regardless of
the app's per-file setting. Keep each upload batch below 4 MB. Supporting larger
uploads or archive downloads requires direct private object-storage transfers;
raising `MAX_UPLOAD_BYTES` alone will not solve it. This remains a go-live
limitation of the current upload/download architecture.
See [Vercel Function limits](https://vercel.com/docs/functions/limitations).

## 6. Project settings

- Framework: **Next.js**; root directory: repository root.
- Install command: `npm ci`; build command: `npm run build`.
- Output directory: leave the Next.js default.
- Production branch: `claude/happy-bohr-k38bp7` (the repository's default branch).
- A successful build with no `DATABASE_URL` is a compile-only check: migrations
  are skipped and accounts/uploads cannot work until real services are connected.
- After deployment, confirm the intended public audience in Vercel's Deployment
  Protection settings. A ready deployment can still require a Vercel sign-in.

---

## After the first deploy

1. Open `/admin/login`, sign in, and change the initial password — the portal
   warns until you do.
2. Sign up a real account and file one slip end to end.
3. Request an export and confirm it becomes ready within about five minutes
   (the cron interval). If it stays queued, `CRON_SECRET` is missing.

## Legal pages

`/privacy` and `/terms` name a placeholder legal entity. Replace the entity
details and support address in `src/config/brand.ts` and have them reviewed
before taking real customers. They are drafted with POPIA principles in mind;
that is a design intent, not a claim of certification.
