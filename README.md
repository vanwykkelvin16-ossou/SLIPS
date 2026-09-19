# Slipsy — Scan it. Save it. Done.

Receipt and slip management for business owners. Photograph a till slip, let it
be read, check the details, and it files itself by year and month — ready to
search, download, or hand to an accountant as a single tidy ZIP.

Built for South African businesses: rand formatting (`R 1 234,56`), day-first
dates, VAT handling, and a March financial-year default — all configurable.

---

## What it does

**For the business owner**

- Capture a slip with the camera, upload a photo, or add a PDF invoice.
- Crop and straighten a skew photo with a real perspective correction; rotate,
  brighten, add extra pages for long slips.
- Merchant, date, time, VAT, total, payment method and line items are read from
  the document and offered as suggestions — never saved without confirmation.
  Fields we were unsure about are flagged *Please check*.
- Likely duplicates are caught before saving (same file, same receipt number, or
  same shop/day/amount) and can be overridden.
- Slips file themselves into `2026 › September`. Custom folders, categories,
  tags and notes are all available.
- Search by shop, receipt number, note or tag; filter by date, folder, category,
  amount or status; sort; multi-select for bulk move, download or delete.
- Download one slip as its original file or as a clean PDF, or export a folder,
  a date range or the whole workspace as a ZIP with a CSV/XLSX summary.
- Works offline: slips captured without signal are stored on the device and
  upload themselves when the network returns, without creating duplicates.
- Installs to the home screen as a PWA.

**For staff** — a separate, read-only admin portal at `/admin` listing who has
registered and how to contact them. It cannot see anyone's receipts, amounts or
documents.

---

## Technology

| Area | Choice |
| --- | --- |
| Framework | Next.js 14 (App Router), React 18, TypeScript (strict) |
| Styling | Tailwind CSS with tokens generated from one brand config |
| Database | PostgreSQL via Prisma |
| Customer auth | Auth.js (NextAuth v5), credentials + bcrypt, JWT session cookie |
| Admin auth | Separate table, separate cookie, separate signing key |
| Storage | Local filesystem or any S3-compatible bucket, behind one adapter |
| OCR | Tesseract on your own server by default; Google Vision, AWS Textract or Azure Document Intelligence behind the same adapter |
| Exports | `archiver` (ZIP), `exceljs` (XLSX), `pdf-lib` (PDF) |
| Images | `sharp` for thumbnails, previews and OCR pre-processing |
| E-mail | Console (development) or SMTP via `nodemailer` |
| Tests | Vitest (unit), Playwright (end-to-end) |

Third-party services sit behind adapters (`src/lib/storage`, `src/lib/ocr`,
`src/lib/email`), so swapping a provider means adding one file, not rewriting
call sites.

---

## Running it locally

**You need:** Node.js 20+, PostgreSQL 14+.

```bash
git clone <this repository>
cd SLIPS
npm install

cp .env.example .env
# Fill in DATABASE_URL, AUTH_SECRET, FILE_SIGNING_SECRET, ADMIN_EMAIL,
# ADMIN_INITIAL_PASSWORD. Generate secrets with: openssl rand -base64 48

npx prisma migrate deploy   # create the schema
npm run seed:admin          # create the initial administrator
npm run dev                 # http://localhost:3000
```

Sign up at `/signup` to create a business workspace. The admin portal is at
`/admin/login` (there is also a discreet link in the public site footer).

With `EMAIL_PROVIDER=console`, verification and password-reset links are printed
to the server log — copy the link from there to complete those flows locally.

### Useful commands

```bash
npm run dev              # development server
npm run build            # production build (runs prisma generate first)
npm start                # serve the production build
npm run typecheck        # TypeScript, no emit
npm run lint             # ESLint
npm test                 # unit tests
npm run test:e2e         # end-to-end tests (starts the app itself)
npm run prisma:migrate   # create a migration after editing the schema
npm run seed:admin       # create or update the initial administrator
npm run worker:exports   # standalone export worker (see below)
node scripts/generate-icons.mjs   # regenerate icons after a brand change
```

---

## Deploying

Deployed on **Vercel**. `DEPLOY.md` is the full checklist; the short version:

1. A Postgres database — `DATABASE_URL` (pooled) and `DIRECT_URL` (direct).
2. An S3-compatible bucket with public access blocked, `STORAGE_DRIVER=s3`.
   The local driver refuses to run on Vercel, where the filesystem is not
   persistent.
3. The environment variables listed in `DEPLOY.md`, including `CRON_SECRET`
   (exports) and `NEXT_PUBLIC_APP_URL` **with its `https://` scheme**.
4. Import the repo at vercel.com/new. The build applies migrations and seeds
   the administrator — there is no manual step.

Exports are driven by a Vercel Cron every five minutes
(`/api/cron/exports`, in `vercel.json`). The extraction route is configured for
120s, which exceeds the Hobby plan's 60s limit — use Pro, or switch
`OCR_PROVIDER` to a cloud engine.

To run it on a plain Node server instead, `npm run build && npm start` with
`STORAGE_DRIVER=local` and `npm run worker:exports` alongside works unchanged.

---

## Database

Twelve tables, all scoped to a business except the identity and admin ones.

- **User** — person signing in. E-mail unique, bcrypt password hash,
  `sessionVersion` for revoking sessions, lockout counters.
- **Business** — the workspace. Currency, financial-year start, filing style.
- **BusinessMember** — links a user to a business with a role. *This row is what
  grants access* — never the session token alone.
- **Receipt** — one slip. Money is stored as integer minor units (cents) with a
  currency code; extraction provenance (`ocrProvider`, `fieldConfidence`,
  `ocrRawText`) is kept alongside, plus `fileHash` for duplicate detection and
  `clientUploadId` as the offline queue's idempotency key.
- **ReceiptFile** — stored objects: original, preview and thumbnail. Holds the
  opaque storage key, real MIME type, size and SHA-256.
- **ReceiptLineItem**, **Category**, **Tag**, **ReceiptTag** — the detail.
- **Folder** — self-referencing tree. `kind` separates automatic year/month
  folders from the user's own.
- **ExportJob** — a requested archive and its progress, result and expiry.
- **AuditLog** — who did what to which document. Records the action, never the
  document's contents or amounts; IP addresses are stored only as a keyed hash.
- **AdminUser** — staff accounts for the admin portal, deliberately separate
  from `User`.
- **PasswordResetToken**, **EmailVerificationToken** — single-use, hashed,
  expiring.

Migrations live in `prisma/migrations/`.

---

## Security

- Authorisation is checked **server-side on every page and every API route**.
  Middleware redirects are a convenience, not the control.
- Every query is scoped to the caller's business. An id belonging to another
  workspace returns "not found" — verified by an end-to-end test that tries it
  from a second account.
- Documents live in private storage under random keys. Nothing from the
  uploaded filename reaches the path. Reads need a valid short-lived signed
  token **and** a session in the owning business; a leaked token is refused.
- Uploads are validated by their real bytes, not their claimed type. Executables
  are rejected. A malware-scanning hook is built in and fails closed.
- Passwords are bcrypt (cost 12). Changing a password, or resetting it,
  invalidates every existing session. Repeated failures lock the account.
- Rate limiting on sign-in, signup, password reset, uploads and exports.
- Same-origin checks on state-changing requests; secure headers and a
  restrictive Content-Security-Policy are set in `next.config.mjs`.
- The service worker caches only public assets — never a page, an API response
  or a document.
- The admin portal shares no table, cookie or key with customer accounts.

Money is stored and summed as integers throughout. No financial total is ever
computed in floating point.

---

## Accessibility

Built to WCAG 2.2 AA: semantic HTML, labelled controls, visible focus on
everything, keyboard-navigable dialogs with focus trapping and restore, live
regions announcing upload and processing progress, touch targets of at least
44px, `prefers-reduced-motion` honoured, and no state communicated by colour
alone — every status badge carries an icon and words.

---

## Testing

```bash
npm test          # 92 unit tests
npm run test:e2e  # 29 end-to-end tests, in a real browser
```

**Unit** (`tests/unit/`) — money parsing and formatting across SA/US/EU
conventions, exact integer arithmetic, VAT splitting; the receipt parser against
a realistic till slip and its edge cases; phone/e-mail/password/export
validation; export filenames and CSV generation including formula-injection
neutralising; upload content sniffing and storage-key/path-traversal safety.

**End-to-end** (`tests/e2e/`), all against a real build, a real database and
real OCR:

- *Journey* — register → onboard → upload → read → review → correct → file →
  sign out → sign in → search → folders → ZIP export → PDF download → delete →
  undo, plus duplicate detection.
- *Isolation* — a second business is refused the first's slip by page, by API,
  in bulk, through a leaked signed URL and through a tampered token.
- *Account flows* — password reset end to end (including that the old password
  stops working and the link cannot be reused), e-mail confirmation, and that a
  reset for an unknown address reveals nothing.
- *Admin* — the portal refuses anonymous visitors, refuses a signed-in customer,
  rate-limits and rejects bad credentials, and exposes contact fields only.
- *PWA* — a valid manifest whose icons all exist, a registered service worker
  that caches the offline page and never caches a page or API response, and
  honest iOS install instructions with no fake prompt.
- *Responsive* — every main screen at six widths from 320px to 1440px with no
  horizontal overflow, the right navigation at each size, and 44px touch targets.

The fixture slip in `tests/fixtures/` is rendered by
`node tests/fixtures/make-receipt.mjs`. To run the suite against an already
running server, use `E2E_BASE_URL=http://localhost:3000 npx playwright test`.

The administrator sign-in test reads `ADMIN_EMAIL` and `ADMIN_INITIAL_PASSWORD`
from the environment — no credential is written into the test files — and skips
itself if they are not set. `tests/e2e/screenshots.spec.ts` is a separate
capture run, not part of the suite's assertions.

---

## Rebranding

Product name, tagline, colours, radii, default categories and currencies all
come from `src/config/brand.ts`. Tailwind reads its palette from that file, the
PWA manifest is generated from it, and `node scripts/generate-icons.mjs`
regenerates every icon and the social preview from the same tokens.

---

## What you need to supply

Everything below works out of the box for a single-server deployment; these are
the decisions and credentials only you can provide.

| What | Why | Needed |
| --- | --- | --- |
| PostgreSQL database URL | Stores everything | **Yes** |
| `AUTH_SECRET`, `FILE_SIGNING_SECRET` | Sign sessions and document URLs | **Yes** |
| `ADMIN_EMAIL` + `ADMIN_INITIAL_PASSWORD` | Seeds the admin portal account | **Yes** |
| A domain with HTTPS | Camera, PWA install, secure cookies | **Yes, for production** |
| SMTP credentials | Password resets and e-mail verification in production | Strongly recommended |
| S3-compatible bucket | Needed if the host has no persistent disk, or you run more than one instance | If applicable |
| Cloud OCR credentials | Higher accuracy and scanned-PDF support | Optional |
| ClamAV or a scanning webhook | Malware scanning of uploads | Optional |

The legal pages at `/privacy` and `/terms` are written for this product but name
a placeholder legal entity. Have them reviewed and replace the entity details
and support address in `src/config/brand.ts` before going live. They are drafted
with POPIA principles in mind; that is a design intent, not a claim of
certification.
