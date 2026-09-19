# Getting Slipsy onto a phone

The app needs an **HTTPS URL** before a phone can do anything useful with it:
the camera, the "Add to Home Screen" install and the `Secure` session cookies
are all refused over plain HTTP. Every option below gives you one.

Pick **Railway** if you just want a link quickly.

---

## Option 1 — Railway (quickest)

1. Push this branch to GitHub (already done: `claude/happy-bohr-k38bp7`).
2. At [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub
   repo** → pick this repository and that branch. It reads `railway.json` and
   builds the `Dockerfile`.
3. In the project, **New** → **Database** → **Add PostgreSQL**.
4. On the app service → **Variables**, add:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (Railway substitutes it) |
   | `AUTH_SECRET` | `openssl rand -base64 48` |
   | `FILE_SIGNING_SECRET` | a different `openssl rand -base64 48` |
   | `ADMIN_EMAIL` | your admin address |
   | `ADMIN_INITIAL_PASSWORD` | a strong password — **not** the e-mail address |
   | `STORAGE_LOCAL_PATH` | `/data/storage` |
   | `OCR_CACHE_PATH` | `/data/tesseract-cache` |

5. **Settings → Volumes** → add a volume mounted at `/data`. Without it,
   uploaded slips are lost on every redeploy.
6. **Settings → Networking** → **Generate Domain**. That URL is your link.
7. Add two more variables set to that URL, then redeploy:
   `AUTH_URL` and `NEXT_PUBLIC_APP_URL`.

Migrations and the admin seed run automatically on every boot
(`docker-entrypoint.sh`).

---

## Option 2 — Render

Push the branch, then **New → Blueprint** and point it at the repository.
`render.yaml` provisions the web service, the Postgres instance and the
10 GB disk, and generates the secrets. You are prompted for `ADMIN_EMAIL`
and `ADMIN_INITIAL_PASSWORD`. After the first deploy, set `AUTH_URL` and
`NEXT_PUBLIC_APP_URL` to the assigned `*.onrender.com` URL and redeploy.

---

## Option 3 — Vercel

Vercel runs the app as serverless functions, which changes three things. The
code now handles all three, but each needs configuration — Vercel will not work
with the defaults.

**1. Storage must be S3.** Each invocation gets its own throwaway filesystem,
so `STORAGE_DRIVER=local` would appear to work and then lose every slip. The
app refuses to start with the local driver on Vercel rather than lose
documents silently. Use any S3-compatible bucket (AWS, Cloudflare R2,
Backblaze B2) **with public access blocked** — slips are served only through
short-lived signed URLs.

**2. Exports run from a cron.** A function is frozen once it responds, so the
background job cannot finish. `vercel.json` schedules `/api/cron/exports`
every five minutes; it needs `CRON_SECRET` set or it returns 503 and does
nothing. Vercel sends the matching header on its own cron calls.

**3. OCR is slower and re-warms.** Tesseract's language data can only be
unpacked into `/tmp`, which is per-invocation, so a cold start re-extracts
~3 MB. The extraction route is configured for 120s. **This exceeds the Hobby
plan's 60s function limit** — on Hobby, either use a cloud OCR provider
(`OCR_PROVIDER=google-vision`, `aws-textract` or `azure-document-intelligence`)
or expect large slips to time out.

### Setting it up

1. Import the repository at [vercel.com/new](https://vercel.com/new).
2. Add a Postgres database (Vercel Postgres, Neon or Supabase) and set
   `DATABASE_URL` to its **pooled** connection string.
3. Set the environment variables:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | pooled Postgres connection string |
   | `AUTH_SECRET` | `openssl rand -base64 48` |
   | `FILE_SIGNING_SECRET` | a different `openssl rand -base64 48` |
   | `CRON_SECRET` | `openssl rand -base64 32` |
   | `AUTH_URL`, `NEXT_PUBLIC_APP_URL` | your `*.vercel.app` URL |
   | `STORAGE_DRIVER` | `s3` |
   | `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | your bucket |
   | `ADMIN_EMAIL`, `ADMIN_INITIAL_PASSWORD` | the admin account |

4. Migrations do not run by themselves here — there is no boot step. Run them
   once against the production database from your machine:

   ```bash
   DATABASE_URL="<direct, non-pooled URL>" npx prisma migrate deploy
   DATABASE_URL="<direct, non-pooled URL>" ADMIN_EMAIL=… ADMIN_INITIAL_PASSWORD=… npm run seed:admin
   ```

   Use the **direct** connection string for migrations, not the pooled one.

If you would rather not manage a bucket and a cron, Railway or Render run the
same image with a plain disk and no such caveats.

---

## Option 4 — Any Docker host (VPS, Fly.io, your own box)

```bash
docker build -t slipsy .
docker run -d --name slipsy -p 3000:3000 \
  -e DATABASE_URL="postgresql://…" \
  -e AUTH_SECRET="$(openssl rand -base64 48)" \
  -e FILE_SIGNING_SECRET="$(openssl rand -base64 48)" \
  -e AUTH_URL="https://your-domain" \
  -e NEXT_PUBLIC_APP_URL="https://your-domain" \
  -e ADMIN_EMAIL="you@example.com" \
  -e ADMIN_INITIAL_PASSWORD="a-strong-password" \
  -v slipsy-data:/data \
  slipsy
```

Put a TLS terminator (Caddy, nginx + certbot, Cloudflare) in front of it.

Building on an Apple Silicon Mac for an x86 host needs
`docker build --platform=linux/amd64 -t slipsy .`

---

## Notes that matter on a phone

- **E-mail.** `EMAIL_PROVIDER` defaults to `console`, so verification and
  password-reset links are printed to the service log instead of being sent.
  Fine for testing — read them from the host's log viewer. For real use set
  `EMAIL_PROVIDER=smtp` and the `SMTP_*` variables.
- **The admin password.** The seed marks the account `mustChangePassword`, so
  the portal nags until you change it. Do not reuse the e-mail address as the
  password on a public URL.
- **First scan is slow.** Tesseract unpacks ~3 MB of language data into
  `OCR_CACHE_PATH` on the first OCR request. Later scans are much faster, as
  long as that path is on the volume.
- **Storage.** `STORAGE_DRIVER=local` needs a persistent volume and works on a
  single instance. Scale beyond one instance and you need
  `STORAGE_DRIVER=s3` with the `S3_*` variables — the bucket must have public
  access blocked; slips are served only through short-lived signed URLs.
- **Exports.** They run in-process on a normal Node host. On a serverless
  platform also run `npm run worker:exports` as a scheduled job.
