# MCCIA Payment Advice

Internal web app for the Finance & Accounts department of MCCIA (Mahratta
Chamber of Commerce, Industries and Agriculture), Pune. Replaces the paper
"Payment Advice" form (`MCCIA/ACTT/PAD/013`) for filling, tracking and
printing — physical wet-ink signing stays exactly as it is today.

This is **Phase 1** only: public submission form, admin review/approve/send-back,
a pixel-faithful PDF replica of the paper form, and Excel export for Tally
data entry. Tally XML export, GST/TDS capture and SSO are Phase 2/3 — the
schema has placeholder columns for them but no UI or logic exists yet.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript) |
| Hosting | Vercel |
| Database | Postgres (Neon), via `@neondatabase/serverless` + Drizzle ORM |
| File storage | Vercel Blob |
| Validation | Zod (shared between client form and API routes) |
| Forms | React Hook Form + Zod resolver |
| Styling | Tailwind CSS |
| PDF generation | `@react-pdf/renderer`, server-side, Node.js runtime |
| Excel export | `exceljs` (see note below — the spec named `xlsx`/SheetJS, but its free tier silently drops the required frozen + bold header row when writing; `exceljs` was substituted to actually satisfy that acceptance criterion) |
| Admin session | Signed HTTP-only JWT cookie via `jose`, isolated in `lib/auth.ts` |

All Blob/PDF-touching route handlers explicitly set `export const runtime = "nodejs"` —
Chromium-based PDF tools are deliberately not used, so nothing here needs Edge
avoidance for that reason, but Blob/PDF libraries themselves aren't
Edge-compatible either.

## Environment variables

Copy `.env.local.example` to `.env.local` and fill in real values. Never commit
`.env.local` (already gitignored).

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Neon Postgres connection string (pooled connection recommended). Neon dashboard → Connection Details. Must support real transactions (the app uses `@neondatabase/serverless`'s WebSocket `Pool`, not the stateless HTTP driver) — this only works against a real Neon (or Neon Local) endpoint, not a plain local Postgres. |
| `BLOB_READ_WRITE_TOKEN` | Yes | Vercel Blob read/write token. Vercel dashboard → Storage → your Blob store → `.env.local` tab. |
| `ADMIN_PASSWORD` | Yes | Single shared password for the Finance admin login (`/admin/login`). Pick a strong value. |
| `AUTH_SECRET` | Yes | Secret used to sign/verify the admin session JWT (HS256). Generate with `openssl rand -base64 32`. |
| `TEST_DATABASE_URL` | No | Only needed to run the `lib/serial.ts` integration tests (`npm test`) against a real Postgres instance. Point this at a **scratch** Neon branch or local Postgres — never at your real `DATABASE_URL` — since the tests write rows to `serial_counters`. Leave unset to skip those tests (the pure unit tests still run). |
| `RESEND_API_KEY` | Only if `EMAIL_MODE=live` | Resend dashboard → API Keys. Unused in preview mode. |
| `EMAIL_MODE` | No | `preview` (default if unset) — render + console.log only, no network call. `live` — actually sends via Resend. |
| `EMAIL_FROM` | No | Sender address. Defaults to Resend's shared testing domain `onboarding@resend.dev`. Do not point this at a `mcciapune.com` address until that domain is DNS-verified in Resend. |
| `EMAIL_TEST_OVERRIDE_RECIPIENT` | No | When `EMAIL_MODE=live`, redirects every email to this address instead of its real recipient, with the subject prefixed `[TEST — would go to: {real_recipient}] `. Leave unset for the real production behavior. |

## The MCCIA logo

The app expects the logo at `public/mccia-logo.png` (referenced on the public
form, admin login, and the generated PDF header). It is not included in this
repo — place the real asset there before deploying. Its absence doesn't break
anything: the PDF header renders a blank space instead of a logo, and the
public pages render `next/image`'s broken-image fallback until it's added.

## Local development

```bash
npm install
cp .env.local.example .env.local   # then fill in real values
npm run db:migrate                 # applies migrations in lib/db/migrations
npm run dev
```

You'll also need at least one row in `recommending_authorities` before the
public form's dropdown has anything to select — add one via `/admin/authorities`
after logging into `/admin/login`, or insert directly.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the Next.js dev server (Turbopack) |
| `npm run build` / `npm run start` | Production build / start |
| `npm run lint` | ESLint |
| `npm test` | Vitest — `lib/serial.ts` unit tests always run; its integration tests (real `SELECT ... FOR UPDATE` allocation, concurrency) run only if `TEST_DATABASE_URL` is set |
| `npm run db:generate` | Diff `lib/db/schema.ts` against `lib/db/migrations/` and generate a new migration SQL file. Does not need a live DB connection. |
| `npm run db:migrate` | Apply pending migrations to `DATABASE_URL` |
| `npm run db:studio` | Open Drizzle Studio against `DATABASE_URL` |
| `npx tsx scripts/render-test-pdf.tsx` | Renders `lib/pdf/PaymentAdviceDocument.tsx` with sample (including stress-test, 600-character) data to `scripts/test-output.pdf` — no DB or auth needed. Useful when tweaking the PDF layout. |
| `npm run pdf:test:cash-voucher` | Renders `lib/pdf/CashVoucherDocument.tsx` with multi-line and long-description sample data to `scripts/cash-voucher-test-output.pdf`. |

## Database migrations

Schema lives in `lib/db/schema.ts`; migrations are plain SQL files under
`lib/db/migrations/`, generated by Drizzle Kit (`drizzle.config.ts`).

1. Edit `lib/db/schema.ts`.
2. `npm run db:generate` — writes a new numbered `.sql` file plus a snapshot
   under `lib/db/migrations/meta/`. Review the generated SQL before applying.
3. `npm run db:migrate` — applies any migrations not yet recorded against
   `DATABASE_URL`.

Never hand-edit an already-applied migration file; add a new one instead.

## Deploying to Vercel

1. **Neon**: create a Neon project, copy the pooled connection string into
   `DATABASE_URL`. Run `npm run db:migrate` locally (or via a one-off Vercel
   deploy hook) against production `DATABASE_URL` before first use.
2. **Vercel Blob**: in the Vercel dashboard, add a Blob store to the project;
   this populates `BLOB_READ_WRITE_TOKEN` automatically when linked, or copy
   it manually into your env vars.
3. **Env vars**: in Vercel → Project → Settings → Environment Variables, set
   `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `ADMIN_PASSWORD`, `AUTH_SECRET`
   for Production (and Preview if you want preview deploys to work against a
   real or scratch DB). Do not set `TEST_DATABASE_URL` in Vercel — it's a
   local-only testing convenience.
4. **Logo**: commit the real `public/mccia-logo.png` before deploying, or the
   header/logo areas render blank.
5. Connect the Git repo to a new Vercel project and deploy — no build command
   overrides are needed (`next build` / `next start` are Vercel's defaults).
   All PDF/Blob route handlers already force the Node.js runtime, so no
   Edge-related configuration is required.
6. After the first deploy, log into `/admin/login` with `ADMIN_PASSWORD` and
   add at least one Recommending Authority via `/admin/authorities` so the
   public form is usable.

## Notes on design decisions

A few points where the spec's tech choices didn't quite match its own
acceptance criteria, resolved during the build (see conversation history for
the full reasoning):

- **Excel export uses `exceljs`, not `xlsx`.** The free `xlsx` (SheetJS
  Community Edition) package cannot write frozen panes or bold cell styling —
  verified by inspecting its raw output XML. `exceljs` does both natively and
  is what actually produces the required frozen + bold header row, correct
  date/number cell types, and auto-fit column widths.
- **Serial allocation uses the Neon `Pool` (WebSocket) driver**, not
  `neon-http`, because gapless serial numbers require a real transaction with
  `SELECT ... FOR UPDATE` — the stateless HTTP driver can't do that.
- **The `/submitted/{serial}` confirmation page never re-fetches by serial
  number.** Serials are sequential and guessable
  (`MCCIA/2026-27/0001`, `...0002`, ...); a public lookup route keyed only by
  serial would let anyone enumerate other people's submissions, including
  bank account details. The submission summary is instead handed off through
  `sessionStorage` at redirect time and read back once, client-side — reloading
  or sharing that URL shows only the serial number, not the sensitive fields.
- **Two PDF routes, not one.** `/api/admin/advice/[id]/pdf` is the official
  replica — admin-authenticated, gated on `APPROVED` status. It turned out
  MCCIA's actual process needs physical signatures gathered *before* Finance
  approval, not after (the printed form gets walked around to Recommending
  Authority / Verifier / Sanctioner first, then reaches Finance) — so there's
  also `/api/advice/[id]/pdf`: public, unauthenticated, available at any
  status, linked from the `/submitted/{serial}` confirmation page. It's safe
  from the same enumeration concern above because it's keyed by the advice's
  random UUID `id` (never its sequential serial), which only the submitter's
  own browser ever learns, handed off via `sessionStorage` alongside the rest
  of the confirmation summary. Both routes render through the same
  `lib/pdf/render.tsx` helper so the two documents can never drift apart.
- **The footer's "Recommended by" prints the Recommending Authority chosen on
  the form** (available immediately at submission), not the admin's
  approver name — that's what makes the pre-approval download meaningful:
  every signature box is already labelled with who should sign it before any
  approval has happened. "Verified by" and "Sanctioned by" are **not**
  collected from the submitter — both are admin-recorded during the Finance
  Verification + Sanctioning pipeline (`lib/db/schema.ts` → `verifiedBy` /
  `sanctionedBy`) and stay blank on the printed form until Finance actually
  verifies/sanctions the advice. The admin's own approver name
  (`approvedByName`) is still recorded for the audit trail but no longer
  appears on the printed form.
- **`lib/db/index.ts` creates its Neon connection lazily**, on first real use,
  via a `Proxy` — not at module import time. `next build` imports every route
  module to collect its metadata without ever calling it, so the original
  eager `throw new Error(...)` on a missing `DATABASE_URL` failed the Vercel
  build regardless of whether the variable was actually configured for the
  deploy; it just wasn't visible at that specific build step.
