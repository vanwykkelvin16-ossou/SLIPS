# Deploy SLIPS / Slipsy manually to Vercel

The app is a Next.js application with a PostgreSQL database, private S3-compatible
file storage and SMTP email. Importing the source alone does not provision these
services. Use `.env.vercel.example` as the list of settings to add to Vercel.
Never commit real credentials.

## 1. Select the source and build settings

| Setting | Value |
| --- | --- |
| Repository | `vanwykkelvin16-ossou/SLIPS` |
| Production branch | `claude/happy-bohr-k38bp7` |
| Root directory | Repository root (leave blank) |
| Framework | Next.js |
| Node.js | 22.x or 24.x |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | Next.js default (do not enter `dist`) |
| Compute | Fluid Compute enabled |
| Plan | Pro or Enterprise for the included five-minute export cron |

The build settings are also in `vercel.json`. Automatic Git-triggered deployments
are disabled (`git.deploymentEnabled=false`) so you control the manual launch.
Set this to true later if you want pushes to deploy automatically. The build first checks required
configuration, then generates Prisma, applies migrations, seeds the admin account
and compiles the app. An existing administrator's password is preserved.
A local build without Vercel settings is a compile check only.

## 2. Add environment variables before deploying

Add them to **Production**. For Preview deployments, use a separate database and
bucket: the build applies migrations to the configured database.

| Purpose | Variables / values |
| --- | --- |
| PostgreSQL | `DATABASE_URL` = pooled hosted connection; `DIRECT_URL` = direct connection for migrations (optional when the main URL is already direct) |
| Signing | `AUTH_SECRET`, `FILE_SIGNING_SECRET`, `CRON_SECRET`: different random values of at least 32 characters |
| Administrator | `ADMIN_EMAIL`, `ADMIN_INITIAL_PASSWORD` (12+ characters, not the email), optional `ADMIN_NAME` |
| Private storage | `STORAGE_DRIVER=s3`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` |
| R2 or other custom S3 service | `S3_ENDPOINT` = full HTTPS endpoint; for R2 use `S3_REGION=auto`, `S3_FORCE_PATH_STYLE=true` |
| Email | `EMAIL_PROVIDER=smtp`, `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE` |
| OCR | `OCR_PROVIDER=tesseract`; leave `OCR_CACHE_PATH` unset or use `/tmp/.tesseract-cache` |
| Public URL | Optional initially: `NEXT_PUBLIC_APP_URL` and `AUTH_URL`. When set, both must be your full HTTPS origin |

Generate each signing secret separately with `openssl rand -base64 48`.
SMTP usually uses port 587 with `SMTP_SECURE=false` (STARTTLS), or port 465 with
`SMTP_SECURE=true`. Use your provider's actual settings and a verified sender.
Database credentials must allow schema migrations, not only reads.

You can check a filled, ignored local copy before deploying:

```bash
node --env-file=.env.vercel.local scripts/check-deployment.mjs
```

This checks configuration presence and format, not live service credentials.
Cloud OCR providers remain optional; each needs its own credentials. Tesseract
handles images and text PDFs; scanned image-only PDFs need a cloud OCR provider
or manual entry. Its language data is included in the server bundle.

## 3. Configure the private bucket

Keep public access disabled. Browser uploads use signed PUT URLs valid for ten
minutes. The app then verifies the user, business, size and actual file contents,
and copies validated bytes to a separate permanent key. Downloads require an
app session and return a signed GET URL valid for two minutes.

Set bucket CORS to your exact production origin. Add a preview origin only when
you use that environment. Example CORS rule (R2 UI accepts the array below; AWS
S3 also accepts this rule array in its CORS editor):

```json
[
  {
    "AllowedOrigins": ["https://YOUR-PRODUCTION-DOMAIN"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Configure two separate one-day expiration lifecycle rules, scoped precisely to:

- `staging/` — abandoned temporary uploads.
- `generated/` — regenerable PDF download copies.

**Do not apply these rules to `businesses/` or the whole bucket.** That prefix
contains original slips and saved exports. Completed staging objects are also
removed by the app; lifecycle rules clean abandoned uploads and download copies.
Use a bucket-scoped key with GetObject, PutObject, DeleteObject and HeadObject
access. R2's object read/write permission provides the needed object operations.

Uploads and downloads bypass Vercel's 4.5 MB function payload limit. The app's
per-file limit defaults to 15 MiB and up to 10 pages per receipt. The server still
validates all original file bytes; the bucket must never be made public.

## 4. Deploy and verify the real services

1. Import the repository/branch above, or use **Create Deployment** in the
   existing `slips` project and select the updated branch/commit. Redeploying
   an old failed deployment can rebuild its old commit, so check the source SHA. The build will name missing settings without printing
   their values. Correct them in Vercel and redeploy.
2. For a public launch, review Vercel Deployment Protection yourself: users must
   be able to reach the app's own signup/login without a Vercel account.
3. Open `/admin/login`, sign in and change the initial admin password.
4. Create a test business account; complete onboarding; verify the email arrives.
5. Upload a photo and a PDF larger than 4.5 MB. Check OCR/manual review, save,
   preview, original download and generated PDF download.
6. Sign out/in and confirm the slips remain. Test another account to confirm
   it cannot access the first account's documents.
7. Request an export. It should complete after a scheduled run (normally within
   about five minutes plus processing time). Download the ZIP.
8. Test password reset, then add the PWA to an iPhone/Android home screen.
9. Replace the legal entity and support address in `src/config/brand.ts` with
   your actual business details before inviting customers.

These service-backed checks require your real database, bucket and email account;
passing local tests and compilation does not prove they are configured.

## Plan and platform notes

The included `*/5 * * * *` schedule requires Pro/Enterprise. Hobby allows only
one daily cron invocation and rejects this schedule. Changing OCR provider does
not remove that restriction. No paid plan is purchased by this repository.

- [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Vercel Function limits](https://vercel.com/docs/functions/limitations)
- [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/)
- [R2 S3 compatibility](https://developers.cloudflare.com/r2/api/s3/api/)
