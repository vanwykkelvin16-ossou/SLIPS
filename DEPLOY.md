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

## Option 3 — Any Docker host (VPS, Fly.io, your own box)

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
