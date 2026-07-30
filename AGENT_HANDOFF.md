# AGENT_HANDOFF.md

**Purpose:** This is the single source of truth for any AI coding agent (Claude Code, Codex, or otherwise) working on this repo. Two agents are being used in parallel to build faster. This file exists so both agents start every session with the same ground truth instead of contradicting or duplicating each other's work.

**Rule: update this file as the LAST step of every session, before ending it, whether you are Claude Code or Codex.** If you finish work and don't update this file, the next agent (possibly the other one) will be working blind.

---

## 0. Ground rules for any agent starting a session

1. **Read this file completely before writing any code.**
2. **Run `git pull` / sync with `main` before doing anything else** — do not branch off a stale checkout, especially before touching `lib/db/migrations/`.
3. **Check the "Open Items" section (§4) before starting new feature work.** If there are unverified open items, prioritize closing them over starting something new, unless the human explicitly says otherwise.
4. **Do not modify files listed in "Do Not Touch Without Asking" (§5) without flagging it to the human first**, even if the change looks like an improvement.
5. **At the end of your session, update:**
   - §3 (Current State) with what you shipped
   - §4 (Open Items) — remove what you verified, add what you left unverified
   - §6 (Session Log) — one short entry, dated, naming which agent did the work
6. **Never assume the other agent's unverified claims are true.** If Codex's summary says "tests passed," and you're Claude Code picking up next, that's a claim to verify, not a fact to build on — especially for anything in §4.
7. **If you and the other agent's changes could conflict** (same file, same migration slot, same route), stop and tell the human rather than resolving it silently.

---

## 1. Project Overview

**MCCIA Payment Advice** — internal Finance app for Mahratta Chamber of Commerce, Industries & Agriculture, replacing a handwritten paper form (`MCCIA/ACTT/PAD/013`) and its manual re-entry into TallyPrime.

Repo: `github.com/mcciaexplore-netizen/payment-advice`

Physical wet-ink signing still happens off-app. The app's job is only to **fill, track, and print** — it does not replace signatures.

## 2. Stack (do not change without asking)

| Layer | Choice |
|---|---|
| Framework | Next.js 16, App Router, TypeScript |
| Hosting | Vercel |
| Database | Postgres (Neon) + Drizzle ORM |
| File storage | Vercel Blob |
| Validation | Zod + React Hook Form |
| Styling | Tailwind CSS |
| PDF generation | `@react-pdf/renderer` (Node runtime — **never Puppeteer/Chromium**, it's unreliable on Vercel serverless) |
| Excel export | `exceljs` |
| Admin auth | Signed JWT, HTTP-only cookie, via `jose`, isolated in `lib/auth.ts` |

Design system: Navy `#0B1F3A`, Forest green `#2E8B57`, Amber `#E8A33D`. Headings: DM Serif Display. Body: Outfit.

## 3. Current State (update this every session)

**Last updated:** 31 July 2026, by Claude Code (shipped the two narrow fixes from Task B's audit: a "Sent Back" tab, and a name-only correction path for Verifier/Sanctioner — still awaiting the human's answer on the Received/In-Process split before any further Finance Pipeline work)

### Shipped — Phase 1 baseline (Claude Code)
- Public form `/` (no login): submitter, payee (vendor typeahead), bill/reference, payment mode (NEFT/Cash), enclosures, mandatory Tax Invoice + Approval/Budget PDF attachments
- Serial number generation: `MCCIA/2026-27/0001` format, gapless, transactional via `SELECT ... FOR UPDATE`
- Send-back/resubmit via one-time signed edit token, `/edit/[token]`, 14-day expiry
- Admin area: login, submissions list with filters + totals, detail view, approve/send-back, vendor CRUD
- Two Payment Advice PDF routes: admin-gated (post-approval) and public via UUID (pre-approval — since physical sign-off happens before Finance approval in MCCIA's real workflow). UUID-keyed, not serial-keyed, to stay enumeration-safe
- Excel export for Tally entry. Schema carries placeholder GST/TDS/Tally columns for not-yet-built Phase 2
- Data model: `vendors`, `payment_advices`, `attachments`, `serial_counters`, `audit_log` (see 2026-07-30 entry below — `recommending_authorities` was redesigned and admin CRUD for it moved to `/admin/staff`; the standalone `/admin/authorities` page no longer exists)

### Shipped — Cash Payment Voucher feature (Codex; reviewed, verified, committed by Claude Code 2026-07-29, commit `b198449`)
- Second, additional PDF for Cash-mode submissions only. Payment Advice PDF stays mandatory for every submission regardless of mode.
- Digitizes MCCIA's old paper "Cash Payment Voucher" form, with field renames (see §7 for full mapping)
- "Nature of Expenditure" is now a repeatable line-item list (description + amount) for Cash mode, with a live auto-summed Total
- New table `cash_voucher_items` (FK to `payment_advices`), populated only when `payment_mode = 'CASH'`
- Migration `0002_nostalgic_carnage.sql` applied
- Voucher "No." reuses the Payment Advice `serial_no` — no separate numbering series
- Line-item total becomes `payment_advices.amount` — single source of truth for both PDFs
- `sanctioned_by_name` now filled by the **submitter at submission time** (new field) — not by Admin at approval
- Routes: `/api/advice/[id]/cash-voucher-pdf` (public, UUID-keyed) and `/api/admin/advice/[id]/cash-voucher-pdf` (admin)
- New component `lib/pdf/CashVoucherDocument.tsx`
- Frontend shows a second "Download Cash Payment Voucher" button for Cash submissions on the post-submit screen

### Shipped — Staff/Authority Roster + Vendor Import (Claude Code, 2026-07-30)
- **Replaced the department-based `recommending_authorities` table with a person-based model.** Migration `0003_staff_authority_roster.sql`:
  - `recommending_authorities`: `department`+`head_name` → single `authority_name` (the 3 old department-based test rows were deleted first — confirmed with the human that zero real `payment_advices` referenced them; see session log)
  - New `staff_members` (the submitter roster) and `staff_authority_options` (link table, `sort_order` 1/2, unique on `(staff_member_id, recommending_authority_id)`)
  - `payment_advices.recommending_authority_id` FK is unchanged — only how it's populated changed
  - This migration's SQL/snapshot were **hand-written**, not `drizzle-kit generate`d — the interactive rename-detection prompt needs a TTY this environment doesn't have. Verified correct by confirming a subsequent `drizzle-kit generate` reports "No schema changes, nothing to migrate."
- `scripts/import-master-data.ts` (`npm run import:master-data -- path/to/file.xlsx [--force]`) imports MCCIA's real staff roster + vendor list from their master xlsx. Idempotent for staff/authorities (case-insensitive reuse, `onConflictDoUpdate` for the link table); prompts before touching vendors if any already exist (`--force` skips the prompt for scripted re-runs). Full parsing rules and two human-confirmed edge-case decisions are in `import-report.md` (gitignored — regenerate by re-running the script) and this session's log entry below.
  - **Result: 51 staff members** (not 52 — the source sheet has an exact duplicate row for "Aishwary Songirkar"; human confirmed dedupe to one), **13 recommending authorities**, **660 vendors** (663 source rows, 3 exact duplicates deduped).
- Public form: "Your Name" is now `StaffNameTypeahead` (`components/form/StaffNameTypeahead.tsx`) — free text with suggestions against active `staff_members`, never blocks submission on an unmatched name. Matching also fires on an exact case-insensitive type-without-clicking, not just a dropdown click.
- Public form: "Recommending Authority" is now `RecommendingAuthorityField` (`components/form/RecommendingAuthorityField.tsx`) — auto-selects the one authority option a matched staff member has, offers a radio choice between two, always offers "Other" (free text, matched client-side against the small active-authorities list). An unmatched/unresolved "Other" value clears `recommendingAuthorityId` entirely and relies on the pre-existing required-UUID Zod validation to block submission — **no new "unknown authority" error path was built**, by design (human explicitly chose "block, ask them to contact Admin" over auto-creating authority rows from free text).
  - This component also reverse-derives the correct radio/Other state from an already-set `recommendingAuthorityId` on mount, so the `/edit/[token]` resubmit flow doesn't silently overwrite a previously-chosen authority with the fresh-submission default.
- New admin page `/admin/staff` (replaces the deleted standalone `/admin/authorities`) — one page, per the spec: Recommending Authorities list + inline "New Authority" form, and Staff Members list (shows assigned authorities) + `/admin/staff/new` and `/admin/staff/[id]` for full create/edit including authority (re)assignment (full replace on save, not a diff).
- New routes: `GET /api/staff/search` (public), `POST /api/admin/staff`, `PATCH /api/admin/staff/[id]` (also handles the `{isActive}`-only toggle — had to use a **standalone** Zod schema for that, not `.pick()` off `staffMemberFormSchema`, since Zod rejects `.pick()`/`.omit()` on a schema with `.superRefine()` attached — this broke at runtime, not compile time, and was only caught by live-testing the toggle button, not by tsc/eslint).
  - Vendor typeahead behavior itself is unchanged — confirmed still auto-fills name-only correctly against the 660 newly imported real vendor rows.

### Shipped — Email template preparation (Codex, 2026-07-30)
- Added `lib/email/templates.ts`: typed, pure HTML render functions for authority-approval, sent-back, and submission-confirmation messages. Dynamic values are HTML-escaped; the Cash Voucher download button is omitted unless a Cash PDF link is supplied.
- Added `lib/email/notify.ts` as the single future mail-provider integration point. It currently logs labelled development previews only; it does not send email or require any email-provider SDK/configuration.
- Wired preview-only notifications into new submission creation and the existing Admin send-back action. `notifyAuthorityApproval()` was exported but had no call site at the time — **the Approval Workflow feature it belongs to did not exist yet; it was built later the same day, see below.**

### Shipped — Approval Workflow (Claude Code, 2026-07-30)
The Recommending Authority is no longer purely informational — the specific authority chosen on the form must now actually approve (or reject) before Admin can approve. Admin's role is now verification (confirm authority sign-off, then download/proceed), not primary approval.
- Schema (migration `0004_giant_starjammers.sql`, all nullable, no new status enum value): `payment_advices.authority_approved_at` / `authority_rejected_at` / `authority_remarks` / `authority_token` (unique) / `authority_token_expires_at`. **"Waiting on Authority" vs "Ready for Finance" is derived from `status = 'SUBMITTED'` + `authority_approved_at` being null/set — not a new status value** (chose derived state over a new enum value to avoid a second place that can drift out of sync with `status`).
- `authority_token` deliberately behaves differently from `edit_token`: it is generated in `lib/advice/authority-token.ts` with a **90-day TTL** (vs edit_token's 14 days — an authority link with no reminder/resend mechanism dying early would strand the whole payment) and is **not single-use/nulled after action** (unlike edit_token) — the same link stays valid so reopening it after acting shows a read-only "already approved/sent back" banner instead of "link invalid." Reissued fresh (new token, authority fields reset to null) on every resubmission via `/api/edit/[token]`, since a changed submission needs fresh authority review regardless of who sent it back.
- New public, token-gated route `/authority-approval/[token]` (mirrors `/edit/[token]`'s structure) — read-only fields, links to Tax Invoice/Approval-Budget attachments only (`/api/authority-approval/[token]/attachments/[attachmentId]`, doc-type-restricted), Approve / Send Back with required remarks. Exact copy per the brief. Already-actioned reopens show a read-only banner instead of the form.
- New routes `POST /api/authority-approval/[token]/approve` and `.../reject` — double-action and expiry guarded by the shared `authorityActionError()` helper. Reject reuses the **same** send-back/edit-token logic Admin's send-back uses — extracted into `lib/advice/send-back.ts` (`performSendBack()`), now called by both the admin route and the authority route, parameterized by `actor` so the audit log and the `/edit/[token]` share-box UI can show who (Admin or the named Authority) triggered a given SENT_BACK cycle.
- `POST /api/admin/advice/[id]/approve` now 409s with "Awaiting Recommending Authority approval before Admin can approve." if `authority_approved_at` is null — enforced server-side, not just hidden in the UI. Chose to **hide** the Approve button/panel (not disable it) in `AdviceActions` while pending, replaced with an amber "waiting on {authority}" box + the copy-link action; once approved, a green "Approved by {authority} on {date}" box appears and the Approve button returns.
- Admin queue (`/admin`) split into 3 tabs via a `tab` query param layered on top of the existing filters (`lib/admin/filters.ts`'s `buildTabCondition`): **Waiting on Authority** (default) and **Ready for Finance** both imply `status = 'SUBMITTED'`; **All** is the original unfiltered list, kept so SENT_BACK/APPROVED entries stay reachable. Tab badges show live counts.
- "Copy link to share with {authority}" added to the admin detail view (`AdviceActions`) and the submitter's `/submitted/[serial]` confirmation screen (via `lib/submission-summary.ts` → now also carries `authorityToken`/`authorityName` through the sessionStorage handoff, same enumeration-safety pattern as the rest of that page).
- `notifyAuthorityApproval()` now fires at submission and at every resubmission (both call sites generate the link at the same point); `notifySentBack()` now also fires on authority rejection with `sentBackBy` set to the authority's name (previously only fired for Admin's own send-back).
- Verified live end-to-end against the real dev server + real Neon DB (not just unit tests): submit → authority link generated + email preview logged → Admin approve blocked 409 → authority approves via the link → double-open shows the read-only baned banner + 409 on re-POST → Admin approve now succeeds → separate submission → authority rejects with remarks → status flips to SENT_BACK, `authority_remarks` set, sent-back email preview logged with the authority's name → resubmit via the edit token → authority fields reset to null and a **new** `authority_token` issued + a fresh approval email logged → admin queue tab counts correctly reflect all of the above (`waiting_authority`/`ready_finance` counts move as advices change state; SENT_BACK entries drop out of both narrow tabs and stay reachable only under "All"). Test rows created for this were deleted afterward.
- **Discovered, did not fix (pre-existing, unrelated to this feature):** `/api/edit/[token]`'s attachment re-upload uses a deterministic Blob pathname (`advices/{serialNo}/{docType}-{fileName}`) with no `allowOverwrite`/`addRandomSuffix` — resubmitting with a **same-named** replacement file 500s with "This blob already exists." Hit this by accident during live verification (used an identical test filename across submit + resubmit). Not part of this task's scope; flagged as an open item below.

### Shipped — Cash PDF removal + Finance Verification/Sanctioning pipeline + Verified email (Claude Code, 2026-07-30)
Three-part task. **§4's `/api/edit/[token]` same-filename Blob collision item above was fixed in a separate session first** (see the session log entry between this one and the Approval Workflow one) — not part of this task, but resolved before it started.

**Part 1 — Cash submissions never get a Payment Advice PDF, only the Cash Payment Voucher, anywhere:**
- Both `/api/advice/[id]/pdf` (public) and `/api/admin/advice/[id]/pdf` (admin) now 404 when `payment_mode = 'CASH'`, mirroring how the cash-voucher-pdf routes already 404 for non-Cash — same pattern, inverted, checked before the admin route's existing `APPROVED`-status 409 gate.
- Submitter confirmation screen (`/submitted/[serial]`), `AdviceActions` (both the pending-preview and post-approval-download branches), and the "What happens next" copy on the confirmation screen (which named Payment-Advice-specific signature boxes — fixed to be mode-aware too, since it was previously wrong for Cash) all now show only the Cash Voucher for Cash.
- `renderSubmissionConfirmationEmail()` (`lib/email/templates.ts`) now conditionally omits the Payment Advice button the same way it already omitted the Cash Voucher button — `paymentAdvicePdfLink` is now optional and gated by `paymentMode !== "CASH"` at both the template and the `/api/submit` call site, mirroring `cashVoucherPdfLink`'s existing gating exactly.

**Part 2 — Finance Verification + Sanctioning pipeline (applies to both NEFT and Cash, runs after Recommending Authority approval):**
- Migration `0005_finance_pipeline.sql`: adds nullable `finance_received_at` / `verified_at` / `verified_by` / `sanctioned_at` / `sanctioned_by` to `payment_advices`; **drops `sanctioned_by_name`** (the old field the *submitter* used to fill in on the Cash form, naming who they expected would sanction it — semantically replaced by the new admin-recorded `sanctioned_by`). Hand-written migration + snapshot (same reason as 0003/0004: dropping a column while adding others triggers drizzle-kit's interactive rename-detection prompt, which needs a TTY this environment doesn't have) — verified via a subsequent zero-diff `drizzle-kit generate`. **Confirmed with the human before dropping**: as of this migration exactly one row had a non-null `sanctioned_by_name` (a pre-existing test row, not real business data — value didn't match any real staff/authority name), and nothing else in the codebase read the column (Excel export never included it).
- Same "derive from timestamps, no new status enum" rule as the Approval Workflow: **"waiting_authority" → "awaiting_finance" → "received_in_process" → "verified_awaiting_sanction" → "sanctioned_ready"** are all derived from which of the five new timestamp columns are set, layered onto the unchanged `status` column.
- `VERIFIER_NAMES` (4 names) and `SANCTIONER_NAMES` (2 names) are hardcoded `as const` arrays + Zod enums in `lib/validation/payment-advice.ts` — **deliberately not a CRUD-managed table** like vendors/authorities, per the brief. Don't add an admin UI to manage these without asking; if the human ever wants to change a name, that's a code change (one line), not a data change.
- **"Approve" is retired, folded into "Sanction."** Deleted `app/api/admin/advice/[id]/approve/route.ts` and its free-text `approvedByName` UI entirely — inspected it per the brief's instruction and concluded the new Received→Verified→Sanctioned sequence is a strict superset of what it did (same server-side `bill_passed_for` requirement, same effect on `status`), just with named, validated people instead of free text. The new `POST /api/admin/advice/[id]/sanction` **dual-writes `status = 'APPROVED'`, `approved_at`, and `approved_by_name = sanctionedBy`** in the same update, so every existing reader of those fields (Excel export's "Approved On"/"Approved By" columns, the Payment Advice PDF header's "Approved on" line, both admin-gated PDF routes' `status === 'APPROVED'` checks) keeps working completely unchanged — zero changes needed to any of them. Considered *not* dual-writing and repointing all those readers at `sanctioned_at`/`sanctioned_by` instead, but that's a larger, unrequested blast radius for the same outcome; flagging this choice here rather than silently picking one, same as the hide-vs-disable call in the Approval Workflow session.
- Three new routes, each with the same double-action-prevention shape as the authority approve/reject routes: `POST /api/admin/advice/[id]/receive` (no name, just a timestamp; requires `authority_approved_at` set), `POST /api/admin/advice/[id]/verify` (requires `finance_received_at` set; body `{verifiedBy}` validated against the 4-name enum; fires `notifyVerified()`), `POST /api/admin/advice/[id]/sanction` (requires `verified_at` set; body `{sanctionedBy, billPassedFor?}`, same billPassedFor-required/falls-back-to-saved-value/≤-amount validation the old approve route had).
- `AdviceActions` reworked: the old single Approve button is gone, replaced by one action panel per pipeline stage (only the current stage's control is interactive — mirrors how Approve/Send Back already toggled independently). **Admin's "Send Back" stays available at every stage** (not gated on pipeline progress) — Admin's oversight role is unchanged, only the forward path was restructured.
- Resubmission via `/api/edit/[token]` now also resets all five new fields to null (same reasoning as the existing authority-field reset: a changed submission needs fresh Finance review too, regardless of who sent it back).
- Admin queue (`/admin`) now has 6 tabs (`lib/admin/filters.ts`): the old **`ready_finance`** tab is renamed/refined to **`awaiting_finance`** (same condition, now also explicit about `finance_received_at` being null); three new tabs added; **`sanctioned_ready`** is the only one keyed on `status = 'APPROVED'` instead of `SUBMITTED` (since sanctioning is what flips `status`); **`all`** is unchanged.
- `sanctionedByName` → `sanctionedBy` renamed throughout the PDF layer (`lib/pdf/render.tsx`, `PaymentAdviceDocument.tsx`, `CashVoucherDocument.tsx`, both sample-render scripts) and now sourced from the new admin-recorded field for **both** PDFs — previously the Payment Advice PDF's own "Sanctioned by :" footer box was *always* blank for NEFT (the submitter-filled field was Cash-only), so this actually gives that box real content for the first time, once Finance sanctions.
- Admin detail page (`app/admin/advice/[id]/page.tsx`) gained a "Finance Pipeline" section (Received / Verified By / Sanctioned By, each "Pending" or name+date) — kept separate from the pre-existing "Verified By (on form)" row in "People", which is the unrelated submitter-filled `verified_by_name` field printed on the PDF footer. Don't conflate the two.

**Part 3 — Verified email:**
- `renderVerifiedEmail()` added to `lib/email/templates.ts`, matching the exact house style (navy header, forest-green accent bar since this is a positive milestone, `details()` table) with no button — this email is informational only, nothing for the submitter to click. `documentLabel` ("Payment Advice" / "Cash Payment Voucher") is passed in by the caller rather than derived from `paymentMode` inside the template, since no existing template already does that derivation. Subject is the literal `"Payment Advice {serial_no} Verified"` even for Cash, per the brief's exact specified copy.
- `notifyVerified()` added to `lib/email/notify.ts`, same dormant console-log preview pattern as the other three, called from the verify route. **Deliberately no email for "Received & In Process" or "Sanctioned"** — not requested; noted as a possible future addition, not built.
- Verified live: full pipeline run against the real dev server + real Neon DB for one NEFT and one Cash advice — submit → authority approve → Admin-approve-blocked-pre-authority already covered by the Approval Workflow session, so this session started from receive → double-action-prevention and stage-ordering 409s hit on every out-of-order attempt (verify-before-receive, sanction-before-verify, sanction-without-bill-passed-for) → verify with an invalid name 400s, valid name 200s + Verified email logged with correct content → sanction with an invalid name 400s, valid name 200s → `status`/`approved_by_name`/`sanctioned_by`/`verified_by` all correct in the DB → NEFT Payment Advice PDF downloads (real PDF bytes) → Cash Payment Advice PDF 404s on both routes at every stage, Cash Voucher PDF downloads successfully once sanctioned → admin queue tab counts move correctly through every stage. Test rows deleted afterward. In the course of this, `rm -rf .next` (run to clear a stale TypeScript cache) crashed the already-running dev server out from under itself — restarted it (`pkill -f "next dev" && npm run dev`), which is what actually killed the previously-tracked background dev-server task; a fresh one is running in its place.

### Shipped — Staff/authority email import + Resend live-send wiring (Claude Code, 2026-07-30)
Combined task, Part B depends on Part A. **EMAIL_MODE still defaults to "preview" everywhere (including this repo's Vercel envs) — nothing about the live app's behavior changed.** The human will flip `EMAIL_MODE=live` in Vercel manually after reviewing the manual verification results below.

**Part A — real staff/authority email data:**
- Only ONE new column needed, not two: `recommending_authorities.email` **already existed** since migration 0003 (declared in schema.ts, just never populated) — the brief's premise that it needed adding was wrong; caught this before writing the migration and flagged it rather than silently adding a second/conflicting column. Migration `0006_mushy_blue_blade.sql` is a single `ALTER TABLE staff_members ADD COLUMN email text` (nullable).
- `lib/staff-authority-emails.ts`: the 39-entry authoritative name→email list (embedded literally, per the brief — not parsed from a file, unlike `scripts/import-master-data.ts`) plus `normalizeName()` (case-insensitive, collapses internal whitespace — `staff_members`/`recommending_authorities` both have a real "RAJNIKANT  GAIKWAD" double-space quirk) and `matchNamesToEmails()`, the pure matching logic shared by the backfill script and its tests.
- `scripts/backfill-staff-authority-emails.ts` (`npm run backfill:staff-emails`) — one-off, re-runnable. **Result: all 39 list entries matched an existing staff_members row (0 unmatched); 39/51 staff now have an email** (the other 12 pre-existing staff simply aren't in this list — not an error). **11/13 recommending_authorities matched; 2 did not: "DG" (expected per the brief — role, not a person) and "S H Kopardekar"** (a genuine unmatched authority — flagging per the brief's instruction; distinct from "SUDHANWA KOPARDEKAR," which did match). Omkar Golhar / Santosh Sawant correctly both got `mcciaramp@mcciapune.com` — no dedup/unique-constraint issue, none exists on either email column.
- `VERIFIER_NAMES`: fixed the "Aabha Khatavkar" spelling to "Abha Khatavkar" (matching the authoritative list) in `lib/validation/payment-advice.ts`. **Checked the live DB for existing `verified_by = 'Aabha Khatavkar'` rows before touching anything — zero found, so there was nothing to reconcile/flag.** Had there been any, this session would have stopped and asked rather than silently rewriting audit history.
- `lib/staff-email.ts`: `resolveStaffEmailByName()`, resolving any name against `staff_members` (not a second hardcoded map, per the brief) — verified it correctly resolves 5 of the 6 hardcoded Verifier/Sanctioner names to real emails and returns `null` for "DG". **Has no live call site yet** — nothing in the current scope actually needs to email a verifier or sanctioner (all 4 notify functions send to either the submitter or the Recommending Authority); built as the brief explicitly asked for it, most likely forward-looking infrastructure. Flagging this rather than inventing an unrequested call site.
- `lib/form/staff-email-autofill.ts`: `resolveAutoFillEmail()`, extracted out of `PaymentAdviceForm.tsx` as pure logic so it's unit-testable without React Testing Library/jsdom — **neither is set up anywhere in this repo**, and every prior "browser interaction not tested" item in §4 reflects that established convention; didn't introduce new test infra unilaterally for one function. Wired into `StaffNameTypeahead`'s `onMatch` handler: auto-fills "Your Email" only when the field is still empty (mirrors `applyVendor`'s "fill only what's on file, never clobber" pattern) and only when the matched staff member has an email on file — otherwise the field is left empty for manual entry, not blocked or errored. `/api/staff/search` now selects and returns `email`.

**Part B — Resend, gated by `EMAIL_MODE`:**
- Added the `resend` npm package. Env vars documented in `.env.local.example` and README's table: `RESEND_API_KEY` (not supplied this session — human said they'd provide it separately; never invented or committed one), `EMAIL_MODE` (`preview` default, `live` to actually send), `EMAIL_FROM` (defaults to `onboarding@resend.dev`, the Resend shared testing domain — **left exactly as instructed, did not attempt a `mcciapune.com` address**), `EMAIL_TEST_OVERRIDE_RECIPIENT`.
- All Part B logic lives in `lib/email/notify.ts` only, per the brief's explicit scope — `lib/email/templates.ts`'s four render functions are untouched. Preview mode (`EMAIL_MODE` unset or anything other than exactly `"live"`) is byte-for-byte the prior behavior: render + `console.info`, zero network calls. Live mode calls Resend; `EMAIL_TEST_OVERRIDE_RECIPIENT` (when set) redirects every email to that address with the subject prefixed `"[TEST — would go to: {real_recipient}] "`. A Resend failure (API-level `{error}` response, or a network-level throw) is caught and logged, never thrown — every notify call site sits inside a real workflow action and must not fail/roll back because an email didn't send.
- All 4 notify function signatures now take a `to` parameter and are `async` (awaited at every call site — required for correctness on Vercel serverless, where an un-awaited promise can be killed mid-flight once the response returns, not just a style choice): `notifySubmissionConfirmation`/`notifySentBack`/`notifyVerified` take the submitter's `submittedByEmail` (already a required, always-populated field); `notifyAuthorityApproval` takes `authority.email ?? null` — when null (13 → 2 authorities still have no email after Part A's backfill), it **does not attempt to send live even if `EMAIL_MODE=live`**, falls back to preview for that specific call, and logs `"No email on file for authority {name}, falling back to preview."` without throwing. Updated the 3 call sites that didn't already select `submittedByEmail` (`send-back`, `authority-approval/reject`, `verify` routes) to add it to their `db.select()`.
- **Real bug found and fixed during testing, not caught by tsc/eslint:** `vi.restoreAllMocks()` in a test's `afterEach` was silently wiping the `vi.fn().mockImplementation(...)` set up for the mocked `Resend` class constructor (not just spy state, as its name suggests) — every live-mode test after the first failed with `Cannot read properties of undefined (reading 'send')`, but only when 2+ tests ran in the same file; any single test in isolation passed, which is what made this genuinely confusing to isolate. Root-caused via a from-scratch minimal repro (bisecting describe-block nesting, env-stub timing, and clearAllMocks semantics) before finding the actual cause. Fixed by dropping `restoreAllMocks()` from that `afterEach` (unnecessary — `vi.spyOn(console, ...)` is freshly re-established every test via `beforeEach` anyway) and keeping `vi.clearAllMocks()` + `vi.unstubAllEnvs()`, which don't touch mock implementations.
- 41 new tests across 5 new test files plus 2 pre-existing route test files updated for the new function signatures/spelling. Verified live against the real dev server + real Neon DB: `/api/staff/search` returns the real backfilled email for a known staff member; a full submission in the (default, unset) preview mode still logs both email previews with zero Resend calls, confirming default behavior is genuinely unchanged. **Did not verify actual live sending** — that needs a real `RESEND_API_KEY`, which the human is providing separately; see the open item below. Also could not check Resend's dashboard for `mcciapune.com` domain verification status — no account access this session; the human needs to confirm this directly, per the brief's explicit instruction not to touch DNS/domain verification.

### Shipped — Removed the stale submitter-filled "Verified By" field (Claude Code, 2026-07-30)
The human noticed the public submission form still showed a required "Verified By" text field, even though (per earlier instruction) submitters shouldn't be the ones supplying that — Finance now records it during the Verify step of the pipeline (`verified_by`, admin-recorded, see the Finance Verification/Sanctioning pipeline entry above). This was a known-but-unaddressed gap: the Finance pipeline session had already dropped the analogous submitter-filled `sanctioned_by_name` field and repointed the PDF's "Sanctioned by" footer box at the admin-recorded `sanctioned_by`, but left `verified_by_name` (the older, pre-pipeline submitter field) untouched — flagged in that session's notes but not acted on. This session finishes that same cleanup for "Verified by," following the identical pattern.
- Migration `0007_drop_verified_by_name.sql`: `ALTER TABLE payment_advices DROP COLUMN verified_by_name` (a clean single-column drop with no accompanying add in the same migration — `drizzle-kit generate` did not trigger the interactive rename prompt this time, so it wrote its own migration + snapshot, no hand-writing needed). **Checked the real DB before dropping**: exactly 1 row existed total (a same-day test row, payee "KHAANE PE" — not real business data), with `verified_by_name = "Sunil"`. Migration applied to the real Neon DB via `npm run db:migrate`.
- Removed the "Verified By" `Field`/`Input` from `PaymentAdviceForm.tsx`, the Zod requirement from `paymentAdviceFormSchema`, and the read/write plumbing from `lib/form-data.ts`, `/api/submit`, `/api/edit/[token]` (both the route and the page's prefill), and `scripts/render-test-pdf.tsx`.
- **PDF footer's "Verified by :" box now sources from the admin-recorded `verifiedBy` (Finance pipeline) instead of the removed submitter field** — renamed the `PaymentAdviceDocument` prop from `verifiedByName: string` to `verifiedBy: string | null` (mirrors `sanctionedBy`'s existing nullable pattern exactly). The box is blank on the PDF until Finance actually verifies the advice — same "blank until that stage happens" convention `sanctionedBy` already established, now consistent for both signature boxes.
- Admin detail page: removed the now-dead "Verified By (on form)" row from the "People" section — the pipeline's own "Finance Pipeline" section (added in the earlier session) already shows the real "Verified By: {name} · {date}" / "Pending" state and was left untouched.
- Updated 3 test files (dropped now-irrelevant `verifiedByName` fixture data from the collision regression test and the validation test) and added `lib/db/migrations/drop-verified-by-name-migration.test.ts` for the new migration, matching the convention of every prior migration.
- Verified live against the real dev server + real Neon DB: confirmed "Verified By" no longer appears anywhere in the public form's rendered HTML; submitted a real advice through `/api/submit` with no `verifiedByName` in the payload (200, succeeded); downloaded the resulting Payment Advice PDF (200, valid single-page PDF, "Verified by" box correctly blank); loaded the admin detail page as an authenticated admin and confirmed the dead "People" row is gone while "Finance Pipeline → Verified By: Pending" still renders correctly. Test row + its 2 Blob attachments deleted afterward. `tsc`, ESLint, all 117 tests (2 pre-existing skipped), and `next build` all pass.
- Also fixed a stale README passage (§"Design notes") that still described `verifiedByName`/`sanctionedByName` as both being required submitter-form fields — `sanctionedByName` had actually already been dropped in the earlier Finance pipeline session and this paragraph was never updated to match. Now accurately describes both as admin-recorded, Finance-pipeline fields.

### Shipped — Fixed squished email logo; discovered Resend sandbox-recipient restriction (Claude Code, 2026-07-30)
The human added a dedicated "AI Studio" test recommending authority (`aistudio@mcciapune.com`) and asked for live-send testing against it, then reported the received email's MCCIA logo looked squished.
- **Root cause of the squished logo**: `lib/email/templates.ts`'s header `<img>` hardcoded `width="56" height="56"` (a square), but the actual source image at `https://mcciapune.com/media/printmedia2023/mccialogo.png` is **1085×258px** — a wide horizontal wordmark (~4.2:1 aspect ratio), confirmed by downloading and inspecting it directly. Forcing a 4.2:1 image into a 1:1 box squishes it. Fixed to `width="160" height="38"` (160/38 ≈ 4.21, matching the source ratio). Same `shell()` header is shared by all 4 email templates, so this one fix applies everywhere. Not yet re-confirmed visually by the human post-fix.
- **Discovered a real Resend platform restriction while testing direct (non-override) delivery to `aistudio@mcciapune.com`**: Resend's shared `onboarding@resend.dev` sending domain will only deliver to the Resend account owner's own verified address — every other recipient gets a 403 (`"You can only send testing emails to your own email address..."`). Tested by briefly unsetting `EMAIL_TEST_OVERRIDE_RECIPIENT` for exactly one submission (immediately restored after); the existing error-handling in `notify.ts` caught and logged the 403 cleanly with no crash, so this required no code fix — but it's a significant fact for the human: **no one except the Resend account owner can receive a real email from this app until `mcciapune.com` (or another owned domain) is verified in Resend and `EMAIL_FROM` is switched to it.** See the updated open item below.
- Test rows from both the AI Studio submission and the direct-delivery test cleaned up afterward. `tsc`, Vitest (117 passing), unaffected by this change (no test asserts logo pixel dimensions).

### Shipped — Task A: Vendor/Staff/Authority Edit + Deactivate audit and fix (Claude Code, 2026-07-31)
The human asked for an audit of the real state of admin CRUD for all three entities (a prior summary had claimed "CRUD" was built; the human suspected only Create actually worked) before any fixing. Findings, then fixes — full detail:

**Audit findings (state before this session):**
- **Vendors**: Edit fully worked (`VendorForm` reused for create/edit, `PATCH /api/admin/vendors/[id]`, all fields). Deactivate/Reactivate worked (`VendorActiveToggle`). No hard-delete route existed. This one was already correct.
- **Staff members**: Edit UI existed (`StaffForm` + `/admin/staff/[id]`) but **only for `fullName` and authority assignments — `email` was never a field on the form or in `staffMemberFormSchema`, on create OR edit**, even though `staff_members.email` has existed since migration 0006 and drives the "Your Email" auto-fill. The only way email ever got populated was the one-off `backfill-staff-authority-emails.ts` script — Admin had no way to set or correct it. Deactivate/Reactivate worked (`StaffActiveToggle`). No hard-delete route.
- **Recommending Authorities**: **Edit did not exist in the UI at all** — confirming the human's suspicion. Only `NewAuthorityInlineForm` (create) and `AuthorityActiveToggle` (isActive-only) existed on `/admin/staff`. The PATCH API route (`/api/admin/authorities/[id]`) already technically supported editing `authorityName`/`email` (accepting a partial body), but nothing in the UI ever called it with anything but `{isActive}`. No hard-delete route.
- **Safety check before deactivation (Task A §3)**: did not exist for any entity — all three toggles fired an unconditional PATCH with zero check for in-progress dependents.
- **Real bug found during the audit, not asked for but directly relevant to §2's acceptance criteria**: `GET /api/staff/search`'s authority-options join (`staff_authority_options` → `recommending_authorities`) had **no filter on `recommendingAuthorities.isActive`** — a staff member linked to a since-deactivated authority would still offer it as a selectable radio option on the public form for a brand-new submission. Fixed (added `eq(recommendingAuthorities.isActive, true)` to the join's `where`). Verified live: a staff member linked to a freshly-deactivated authority now returns `authorityOptions: []` from the search endpoint.

**§4 — snapshot vs. live-FK, per field (report only, per the human's explicit instruction not to change this):**
- `submitted_by_name`: **snapshot**. Plain `text` column copied at submission time. `payment_advices` has **no FK to `staff_members` at all** — not even a nullable one. Editing or deactivating a staff member's record has zero effect on any historical submission's displayed name.
- `recommending_authority_id`: **live FK**. Every PDF route, the admin detail page, and the authority-approval page all do a fresh `SELECT authority_name FROM recommending_authorities WHERE id = ...` at render/view time — confirmed by reading `app/api/advice/[id]/pdf/route.tsx` directly. **Renaming an authority retroactively changes what's printed on every PDF for every advice that references it, including ones already submitted/approved, if ever re-downloaded or re-viewed.** This is real and not something this session changed — flagging per instruction, not fixing.
- Vendor fields (`payeeName`, `payeeAddress`, `payeeEmail`, `payeeContactPerson`, `payeeContactPhone`, `payeeGstin`, `payeeUdyamNumber`): **snapshot**. `vendorId` is stored as an FK but only used for typeahead re-fill convenience; the actual displayed/printed values are separate plain-text columns copied at submission time. Editing a vendor later does not affect historical records.

**Fixes shipped:**
1. **Staff email**: added `email` to `staffMemberFormSchema`, `StaffForm` (new Field, matches `VendorForm`'s style), `POST/PATCH /api/admin/staff[/[id]]`, and the edit page's `initialValues`. Now fully editable, same as vendors/authorities.
2. **Authority Edit UI**: new `components/admin/AuthoritiesSection.tsx` (client component) replaces the old create-only `NewAuthorityInlineForm` + static table split — one component now manages Create AND Edit through the same inline form (an "Edit" button per row pre-fills it in place, `PATCH` instead of `POST`), keeping the deliberate "authorities live inline on `/admin/staff`, no standalone page" design from the earlier Staff/Authority Roster session. `NewAuthorityInlineForm.tsx` deleted (fully superseded, zero remaining references).
3. **Safety check on deactivation** (staff + authorities only, per the brief — not vendors): new `lib/advice/deactivation-safety.ts` — `countInProgressForAuthority(id)` (reliable, via the `recommending_authority_id` FK) and `countInProgressForStaffName(fullName)` (best-effort case-insensitive/trimmed name match against `submitted_by_name` — **explicitly documented as unreliable, not exact, because staff has no FK on `payment_advices` at all**; flagged in the code comment and here rather than presented as airtight). "In progress" = `status = 'SUBMITTED'` (covers every pre-final pipeline stage); `SENT_BACK` and `APPROVED` (always sanctioned, since sanctioning is the only path that sets it) both count as closed-out, matching the human's own framing exactly ("not yet Sanctioned, rejected/closed out").
   - Both `PATCH /api/admin/staff/[id]` (both its toggle-only and full-edit-form code paths) and `PATCH /api/admin/authorities/[id]` now return **409** with `{error, inProgressCount}` when asked to set `isActive: false` on an entity with ≥1 in-progress dependent, unless the body also carries `force: true`.
   - `StaffActiveToggle`, `AuthorityActiveToggle`, `StaffForm`'s full submit, and the new `AuthoritiesSection`'s inline form all catch the 409, show `window.confirm()` with the exact warning message, and retry with `force: true` only if the admin confirms — "warn, then let them proceed if they choose," per the brief. No existing confirm/modal pattern existed anywhere in this repo to reuse; `window.confirm()` was the simplest fit for a plain admin toggle button, consistent with the rest of this app's lightweight admin UI.
4. Deactivated staff/authorities already correctly disappeared from the top-level active lists (`/`, `/edit/[token]`'s `recommendingAuthorities` query, `/api/staff/search`'s own `staffMembers.isActive` filter) — those were already right; only the nested authority-options join (fix #-in-audit-above) was wrong.
5. Reactivate already worked for both (same toggle, no safety check needed going active→active is a no-op path, active-false→true never checked).

**Verified live** against the real dev server + real Neon DB (not just unit tests, consistent with this repo's established convention for anything touching `db.transaction`/multi-shape queries that would need brittle mocking): created a test authority → edited its name+email (200) → submitted a real advice against it → attempted deactivate without force (409, count=1) → deactivate with force (200) → confirmed the PDF and admin detail page still correctly show the (now inactive) authority's name on that historical advice → confirmed it's gone from the public form's active list. Created a test staff member linked to that now-inactive authority → confirmed `/api/staff/search` returns `authorityOptions: []` for them (the bug fix). Edited the staff member's name to exactly match the test advice's `submittedByName` → attempted deactivate via both the toggle-only body shape and the full-edit-form body shape, both correctly 409'd with count=1, both succeeded with `force: true`, reactivate worked with no check. Vendor edit re-confirmed still works (was already correct). All test rows/blobs cleaned up after. New tests: `lib/advice/deactivation-safety.test.ts` (4 tests, unit-level for the two count functions — the route-level 409/force logic was verified live rather than mocked, for the same reason cited above). `tsc`, ESLint, Vitest (121 passing, 2 pre-existing skipped), and `next build` all clean.

**Not done, out of scope for Task A, flagged for awareness:** the admin's own "assign an authority to a staff member" dropdown (in `StaffForm`, both create and edit) still lists inactive authorities as assignable — left as-is since the acceptance criteria specifically said the **public form's** dropdowns must exclude inactive records, not admin's internal assignment UI, and an admin might legitimately want to see/reassign historical links. Not a bug relative to what was asked.

### Audit (no changes shipped) — Task B: Finance Pipeline status logic vs. intended workflow (Claude Code, 2026-07-31)
Pure audit per the human's brief — report only, no schema changes (explicitly withheld pending the human's answer to (a) below), no UI changes. Findings:

**(a) Combined "Received & In Process" vs. two separate steps — ASKED THE HUMAN DIRECTLY, NOT DECIDED.** The current build has always had exactly one timestamp (`finance_received_at`) covering both; the intended workflow describes them as two distinct manual steps. This is a schema question either way (adding an `in_process_at` column is the two-step path) — flagged to the human rather than guessed. **Awaiting an answer before touching this.**

**(b) Tab filter logic — exact conditions, verbatim from `lib/admin/filters.ts`'s `buildTabCondition()`:**
- `waiting_authority`: `status = 'SUBMITTED' AND authority_approved_at IS NULL`
- `awaiting_finance`: `status = 'SUBMITTED' AND authority_approved_at IS NOT NULL AND finance_received_at IS NULL`
- `received_in_process`: `status = 'SUBMITTED' AND finance_received_at IS NOT NULL AND verified_at IS NULL`
- `verified_awaiting_sanction`: `status = 'SUBMITTED' AND verified_at IS NOT NULL AND sanctioned_at IS NULL`
- `sanctioned_ready`: `status = 'APPROVED'` (no timestamp condition needed — sanctioning is the only path that ever sets `status = 'APPROVED'`)
- `all`: no condition, unfiltered

No bug found here — every condition correctly matches its intended stage and the stages are mutually exclusive (confirmed live, not just read).

**(c) API-level gating — tested live via direct `curl` calls attempting to skip steps, not just checking the UI hides buttons.** Every route rejects out-of-order transitions server-side:
- `/receive` 409s if `authority_approved_at` is null ("Awaiting Recommending Authority approval first.")
- `/verify` 409s if `finance_received_at` is null ("Must be marked Received & In Process before it can be verified.")
- `/sanction` 409s if `verified_at` is null ("Must be verified before it can be sanctioned.")
- All three also 409 on double-action (already-received / already-verified / already-sanctioned), and `/verify`/`/sanction` 400 on an invalid name outside the fixed lists.
- Live-tested the full skip-ahead matrix on a fresh submission: tried `/receive`, `/verify`, `/sanction` all at stage 0 (pre-authority-approval) → all 409. Approved via authority, tried `/verify` and `/sanction` directly → both still 409 (correctly still blocked on `/receive` not having happened). Received, tried `/sanction` directly → still 409 (blocked on `/verify`). Verified with an invalid name → 400. Ran the full valid happy path → 200 at every step, then confirmed every step also correctly 409s a second time (double-action). **No gating bug found — nothing to fix.**

**(d) Rejected/sent-back submissions — confirmed excluded from all 5 narrow tabs, only reachable via "All."** Live-tested: submitted an advice, had the authority reject it, then checked all 5 narrow tabs (0 matches each) and the "All" tab (1 match, with or without an explicit `status=SENT_BACK` filter). **Real gap, not fixed (per the brief — report only):** there is no dedicated tab, badge, or count anywhere that surfaces "N submissions are sitting sent-back, waiting on the submitter to fix and resubmit." An admin only finds them by thinking to open "All" and optionally filtering by status. It doesn't "silently disappear" (it's genuinely still there and reachable) but nothing proactively surfaces it either.

**(e) `audit_log` coverage per transition — complete, confirmed both by reading every route and by inspecting a real live-tested advice's full audit trail.** Every action that currently exists in the schema writes a row: `SUBMITTED`, `AUTHORITY_APPROVED`, `SENT_BACK` (shared by both Admin's send-back and the Authority's reject — actor field distinguishes which), `FINANCE_RECEIVED`, `VERIFIED`, `SANCTIONED`, `RESUBMITTED`, `EXPORTED`. There is no separate "In Process" audit action because there is no separate "In Process" column today (see (a)) — once/if that's split, it would need its own action too. **No gap found for what currently exists.**

**(f) No undo/reverse mechanism exists anywhere.** Confirmed by grep (no "undo"/"reverse"/"unverify" anywhere in the codebase) and by inspecting every place that nulls out `finance_received_at`/`verified_at`/`sanctioned_at` — the only one is `/api/edit/[token]`'s full resubmission reset, which also wipes the authority approval and forces the entire pipeline to restart from scratch. **If Admin clicks the wrong name on Verify or Sanction, there is no way to correct just that one field** short of a direct DB edit or a full resubmit-and-restart cycle (which also re-notifies the authority and submitter). Flagged as a real gap, not built — the brief was explicit this is report-only.

**No logic bugs were found anywhere in (b) or (c)**, so nothing needed fixing under the "fix only what's clearly a bug" instruction — the tab filters and API gating are already fully correct and were confirmed live, not just by code review. All test data created during this audit was cleaned up afterward. `tsc` and Vitest (121 passing) re-confirmed clean; no code was changed this session, so no build/lint re-run was needed beyond that sanity check.

### Shipped — Two narrow fixes from Task B's audit (Claude Code, 2026-07-31)
Explicitly scoped: fix only the two specific gaps Task B flagged, don't touch tab filter logic, API gating, or the (a) combined Received/In-Process timestamp question (still unanswered, still blocking any schema work there).

**Fix 1 — "Sent Back" tab, making an already-correct state visible (no behavior change):**
- `lib/admin/filters.ts`: added `"sent_back"` to `ADMIN_TABS`, and `buildTabCondition("sent_back")` → `eq(status, 'SENT_BACK')`. The existing 5 tabs' conditions are byte-for-byte unchanged — confirmed with a live before/after count check against the real dev DB (`waiting_authority=1, awaiting_finance=0, received_in_process=0, verified_awaiting_sanction=0, sanctioned_ready=0` both before and after adding a rejected submission; only `sent_back` moved, from 0 to 1).
- `app/admin/page.tsx`: added the 6th `TabLink` with a live count query (same `Promise.all` pattern as the other 5), and a **Remarks column shown only when `tab === "sent_back"`** — sources from `admin_remarks` (not `authority_remarks`), since `performSendBack()` always sets `admin_remarks` regardless of whether Admin or the Authority triggered the send-back, while `authority_remarks` is only set for authority rejections specifically. Truncated with `title=` for hover-to-see-full-text, per the brief's "in the row or on hover."
- New test: `lib/admin/filters.test.ts` gained a regression guard that `sent_back` keys on `SENT_BACK` specifically, not `SUBMITTED`/`APPROVED`.

**Fix 2 — Narrow name-only correction for Verifier/Sanctioner (explicitly NOT general undo):**
- Confirmed before starting, per the brief's request: `VERIFIER_NAMES`/`SANCTIONER_NAMES` in `lib/validation/payment-advice.ts` are unchanged — still the same hardcoded 4-person/2-person lists documented in earlier sessions. The correction picker reuses them directly.
- New `PATCH` handlers added to the **existing** `verify`/`sanction` route files (not new route paths) — `POST` still performs the original action, `PATCH` now corrects just the name:
  - `PATCH /api/admin/advice/[id]/verify`: 404 if the advice doesn't exist, 409 if not yet verified ("nothing to correct"), 400 for a name outside the 4-person list, 409 if the submitted name is already what's recorded (a no-op isn't a correction), otherwise updates `verified_by` only — **`verified_at` is never touched** — and writes an audit_log row `VERIFIER_NAME_CORRECTED` (actor `"ADMIN"`, `details: {oldVerifiedBy, newVerifiedBy}`). Does **not** call `notifyVerified()` again.
  - `PATCH /api/admin/advice/[id]/sanction`: same shape, updates `sanctioned_by`. **Also updates `approved_by_name` in the same write** — flagging this explicitly since it's technically a second column: `approved_by_name` is a deliberate dual-write mirror of `sanctioned_by` from the original Sanction action (see the Finance Pipeline session's entry above), and it's what the Excel export's "Approved By" column and would otherwise keep printing the old, wrong name even after the "correction." Treated this as the same underlying fact (who sanctioned it), not "another field" in the sense the brief meant to protect (`sanctioned_at`/`status`/`bill_passed_for`, none of which are touched). Writes `SANCTIONER_NAME_CORRECTED` with `{oldSanctionedBy, newSanctionedBy}`.
  - New validation schemas `verifierNameCorrectionSchema`/`sanctionerNameCorrectionSchema` (narrower than `verifySchema`/`sanctionSchema` — no `billPassedFor`, since a name correction must never touch it).
- New `components/admin/NameCorrectionAction.tsx` (client): a small "Correct name" text-button that expands into the same fixed-list `<select>` + Save/Cancel, calls the new `PATCH` endpoint, `router.refresh()`s on success. Wired into `app/admin/advice/[id]/page.tsx`'s "Finance Pipeline" section, replacing the plain-text `Row` for "Verified By"/"Sanctioned By" with custom markup that renders the action **only when there's a name to correct** (`verifiedAt`/`sanctionedAt` set). **"Received & In Process" was left as a plain `Row`, unchanged** — no name is ever attached to that step, so there's nothing to correct there, per the brief.
- New tests: extended `lib/advice/finance-verify-route.test.ts` and `lib/advice/finance-sanction-route.test.ts` with `PATCH` describe blocks (404/409-not-yet-actioned/400-invalid-name/409-no-op-same-name/success-with-correct-audit-and-untouched-timestamp cases each).
- **Verified live** against the real dev server + real Neon DB: ran a real advice through approve → receive → verify with a deliberately wrong name ("Vaidehi Marathe") → confirmed `PATCH .../verify` 409s on re-submitting the same name, 400s on an invalid name, 200s on the real correction ("Sunil Salunke") → confirmed via direct SQL that `verified_at` was byte-for-byte unchanged while `verified_by` updated, and the audit_log shows a clean `VERIFIER_NAME_CORRECTED` row with both names → sanctioned the same advice, corrected the sanctioner name too → confirmed `sanctioned_by` AND `approved_by_name` both updated, `sanctioned_at`/`status` untouched → confirmed the exported Excel file's shared strings contain the corrected name → confirmed on the rendered admin detail page HTML that exactly two "Correct name" controls exist (next to Verified By and Sanctioned By) and none near Received & In Process. All test data cleaned up after; DB back to its pre-session single baseline row. `tsc`, ESLint, Vitest (132 passing, 2 pre-existing skipped), and `next build` all clean.

## 4. Open Items (verify before building on top of these)

Status legend: 🔴 unverified / high risk · 🟡 unverified / lower risk · 🟢 verified

- 🟢 **Cash-voucher-pdf routes (public + admin) 404 correctly for NEFT submissions.** Verified 2026-07-29 by Claude Code, two ways: (1) live end-to-end against the real dev server + real Neon DB — inserted a real NEFT `payment_advices` row, hit both `/api/advice/[id]/cash-voucher-pdf` and `/api/admin/advice/[id]/cash-voucher-pdf`, got clean `404 {"error":"Not found"}` with `Content-Type: application/json` from both, no server-side errors in the log. Also spot-checked the CASH happy path on a real row — both routes 200 with a real single-page PDF. (2) Strengthened the existing mocked test in `lib/pdf/cash-voucher-routes.test.ts` to also assert `content-type` isn't `application/pdf` and the JSON body shape, not just the status code — guards specifically against a future regression that returns 200 with empty/garbage PDF bytes instead of 404. No code fix was needed; both routes already guarded on `paymentMode !== "CASH"` before doing any rendering.
- 🟡 Confirm Excel/Tally export column order is unchanged, and Cash rows' joined `nature_of_expenditure` string (line items joined with `"; "`) reads sensibly for Finance. *(Partially checked 2026-07-30: confirmed `GET /api/admin/export` still returns 200/a valid .xlsx after the `authority_name` schema change, but there were 0 `payment_advices` rows in the DB at the time — did not confirm the Recommending Authority column actually renders the right name in a populated row, or re-check column order/Cash row content. Still open.)*
- 🟢 **Admin detail view renders the itemized Cash Voucher breakdown line-by-line, not just the collapsed total.** Verified 2026-07-29 by Claude Code live: inserted a real Cash advice with 3 line items (Fuel/Tea and snacks/Repairs) into the real Neon DB, loaded `/admin/advice/[id]` as an authenticated admin session, confirmed all 3 descriptions and amounts render in a "Cash Voucher Items" table (`app/admin/advice/[id]/page.tsx`).
- 🟢 **The 2 skipped DB integration tests are pre-existing, unrelated to the Cash Voucher feature.** Verified 2026-07-29 by Claude Code with git evidence, not inference: `git status --short lib/serial.test.ts` shows zero uncommitted changes to that file (Codex never touched it), and `git log --oneline -- lib/serial.test.ts` / `git blame` show the entire `describe.skipIf(!testDbUrl)` block was written in the very first commit (`a782956`, "Initial build: Phase 1 MCCIA Payment Advice app") — before the Cash Voucher feature existed in any form, committed or not (it's still fully uncommitted as of this session; see session log). They're gated behind an optional `TEST_DATABASE_URL` env var by design, so `npm test` stays green with no live DB configured — not a bug, not a regression. Left skipped, as instructed; not unskipped.
- ⬜ **Undecided (needs human decision, not an agent decision):** should an "Expenditure Breakdown" column be added to the Excel export? Currently declined.
- ⬜ **Undecided (needs human decision):** should a "Verified by" field exist on the Cash Voucher? Paper form didn't have it — only the Payment Advice has that 4th signature box. Currently left off.
- 🟡 **`StaffNameTypeahead` and `RecommendingAuthorityField`'s interactive browser behavior (debounce, suggestion-click, exact-match-while-typing, radio auto-select) was NOT tested in an actual browser** — this session has no browser automation available. What *was* verified: `GET /api/staff/search` returns exactly the right shape/data for 4 real edge cases (1-option match, 2-option match, 0-option match, no match), full `tsc`/`eslint` pass, and a full real submission driven through `/api/submit` with a pre-resolved `recommendingAuthorityId` (i.e. the API/data layer end-to-end, not the React interaction layer). If a human or a future agent can drive an actual browser, exercising the typeahead dropdown, "Other" radio, and the free-text authority suggestions by hand would close this out.
- 🟡 Excel export's Recommending Authority column with real populated rows — see the entry above. Not re-checked against the Approval Workflow columns either (Excel export's column list was intentionally left untouched this session — new authority columns are not exported; confirm with the human whether Finance wants them before adding).
- 🟢 **Approval Workflow feature (Recommending Authority approve/reject gate) shipped and verified live end-to-end 2026-07-30 by Claude Code** — see the "Shipped" entry above for full detail and the exact verification steps performed against the real dev server + real Neon DB.
- 🟢 **Fixed 2026-07-30 by Claude Code: same-filename attachment replacement on `/api/edit/[token]` resubmit no longer 500s.** Root cause: the Blob pathname (`advices/{serialNo}/{docType}-{fileName}`) is deterministic, and `put()` defaults to rejecting a write to a pathname that already exists — a replacement file sharing the original's filename collided with it. Fixed by adding `addRandomSuffix: true` to both `put()` calls (`app/api/edit/[token]/route.ts` and, for consistency, `app/api/submit/route.ts`, which had the same latent pattern though far less likely to trigger there since each submission gets a fresh serial number). Deliberately **not** `allowOverwrite: true` — that would let the new file's bytes land at the old row's pathname *before* the DB transaction confirms the swap, so a transaction failure after upload would leave the old attachment row silently pointing at the new (wrong) content. `addRandomSuffix` keeps the existing upload-new-distinct-path → commit DB swap → delete-old-blob-after-commit ordering completely intact; every attachment-serving route already reads `blobPathname` from the DB row rather than reconstructing it, so this was a fully isolated change. Verified: new regression test (`lib/advice/edit-resubmit-attachment-collision.test.ts`, including a sanity-check test that the same mock reproduces the original 500 without the fix) plus a live run against the real dev server + Neon DB — reject → resubmit with an identical filename → 200, and the new file fetched back correctly through `/api/admin/attachments/[id]`. Test data deleted afterward.
- 🟡 **`AuthorityApprovalView`'s interactive browser behavior (Approve/Send Back buttons, remarks textarea, already-actioned banner) was NOT tested in an actual browser** — verified via direct API calls (`curl`) against the real dev server + real DB, and the page's server-rendered HTML was inspected, but no browser automation was available this session. The API/data layer is confirmed correct end-to-end; the React interaction layer (button state transitions, error display) is not.
- 🟡 **Admin queue tab UI (`TabLink`, badge counts) was verified via rendered HTML inspection, not a live click-through in a browser** — confirmed the counts and `?tab=` links are correct by fetching each tab's URL directly and checking which serial numbers appear, but did not visually confirm the active-tab styling or manually click through page transitions.
- 🟢 **Part 1 (Cash never gets a Payment Advice PDF), Part 2 (Finance Verification + Sanctioning pipeline), and Part 3 (Verified email) shipped and verified live end-to-end 2026-07-30 by Claude Code** — see the "Shipped" entry above for full detail; both NEFT and Cash advices were run through the entire pipeline (receive → verify → sanction) against the real dev server + real Neon DB, all double-action/stage-ordering guards confirmed to 409/400 correctly, the Verified email confirmed to log with correct content, and the dual-write into `approved_at`/`approved_by_name` confirmed correct in the DB and reflected in a real downloaded PDF.
- 🟡 **The new `receive`/`verify`/`sanction` action panels in `AdviceActions` (button clicks, the 4-/2-person `<select>` dropdowns, disabled states) were NOT tested in an actual browser** — verified via direct `curl` calls to each route against the real dev server + real DB (every guard, every success path), and the rendered admin page HTML was inspected for the correct tab labels/counts, but no browser automation was available this session. Same gap as `AuthorityApprovalView`'s entry above, same recommendation: a human or a future agent with browser access should click through Receive → Verify → Sanction once by hand.
- 🟡 **Excel export does not include any of the five new finance-pipeline columns** (`finance_received_at`, `verified_at`, `verified_by`, `sanctioned_at`, `sanctioned_by`) — intentionally left untouched this session, same as the Approval Workflow session left out the authority columns. Confirm with the human whether Finance wants these as export columns before adding.
- ⬜ **Possible future addition, not built (per the brief — do NOT build without asking):** emails for the "Received & In Process" and "Sanctioned" transitions. Only "Verified" sends an email today; the other two are dashboard-only.
- 🟢 **Live-send verification: confirmed by the human 2026-07-30.** Subject prefix (`[TEST — would go to: ...]`) confirmed correct in the received email. **Logo was reported squished — root-caused and fixed** (see the "Shipped" entry below); not yet re-confirmed visually by the human after the fix, but the root cause (wrong aspect ratio, not a broken image) is fully understood and corrected.
- ⬜ **Resend's shared testing domain (`onboarding@resend.dev`) can ONLY deliver to the Resend account's own verified email address — confirmed 2026-07-30 by a real 403 from the API.** Attempted to send `notifyAuthorityApproval` directly to a real, non-override address (`aistudio@mcciapune.com`, a fresh test authority the human added) with `EMAIL_TEST_OVERRIDE_RECIPIENT` temporarily unset. Resend rejected it: `"You can only send testing emails to your own email address (mcciaexplore@gmail.com). To send emails to other recipients, please verify a domain at resend.com/domains, and change the from address to an email using this domain."` The error was caught and logged cleanly by `lib/email/notify.ts`'s existing error handling — did not throw, did not 500 the submit route — so no code changes were needed to handle it, but it's an important operational fact: **as long as `EMAIL_FROM` stays on the shared `onboarding@resend.dev` domain, this app can only ever deliver live email to the Resend account owner's own inbox, never to real staff/authorities/submitters.** Real delivery to anyone else requires the human to verify `mcciapune.com` (or another owned domain) in the Resend dashboard and switch `EMAIL_FROM` to an address on it. `EMAIL_TEST_OVERRIDE_RECIPIENT` was restored immediately after this one-off test; no other submissions were sent while it was unset.
- 🟡 **Recommending Authority "S H Kopardekar" has no email on file and doesn't match any name in the authoritative list** (distinct from "SUDHANWA KOPARDEKAR," which does match) — will fall back to preview mode for `notifyAuthorityApproval` indefinitely until the human either gets their real email or confirms this is meant to be the same person as an existing matched entry (possibly a data-entry variant, not a genuinely different person — not confirmed either way this session, flagging rather than guessing).
- ⬜ **Resend `mcciapune.com` domain verification status is unknown** — no Resend account/dashboard access this session. Per the brief's explicit instruction, did not touch DNS or attempt domain verification; `EMAIL_FROM` is left at the shared `onboarding@resend.dev` testing domain. The human needs to confirm domain status directly in the Resend dashboard before ever pointing `EMAIL_FROM` at a `mcciapune.com` address. **Now confirmed higher-priority than originally scoped** — see the entry above: until this is done, the app cannot deliver live email to anyone but the Resend account owner, full stop, not just a "nicer to have real domain" cosmetic concern.
- 🟡 **`lib/staff-email.ts`'s `resolveStaffEmailByName()` has no live call site** — built and unit-tested per the brief's explicit request (resolve the 6 Verifier/Sanctioner names against the staff table), but nothing in this session's scope actually emails a verifier or sanctioner, so it isn't wired into any route. Likely forward-looking infrastructure; don't assume it's dead code to be deleted without checking with the human first.
- 🟢 **Task A (Vendor/Staff/Authority Edit + Deactivate) shipped and verified live 2026-07-31 by Claude Code** — see the "Shipped" entry above for the full audit findings (only Authority Edit was genuinely missing; staff email was never editable; a real dropdown-corruption bug was found and fixed) and the exact live verification performed against the real dev server + real Neon DB.
- 🟡 **`countInProgressForStaffName()`'s name-match safety check is best-effort, not exact** — `payment_advices` has no FK to `staff_members` at all, so deactivating a staff member whose submitted name doesn't textually match their canonical staff record (typo, nickname, maiden/married name change) will silently report 0 in-progress submissions even if they have some. This is a schema limitation, not a bug in the check itself — flagged in code and here rather than presented as reliable. Only a `staff_member_id` FK on `payment_advices` (a bigger, unrequested schema change) would make this exact.
- ⬜ **Task B audit (2026-07-31): "Received" and "In Process" are still one combined timestamp (`finance_received_at`), not two separate steps** — the human's own stated intended workflow describes them as distinct manual steps. Question asked directly, not decided: should this become two separate timestamps/tabs, or is the combined state fine for how Finance actually works day to day? **Blocking any schema change here until the human answers.**
- 🟢 **Rejected/sent-back visibility gap — fixed 2026-07-31.** A "Sent Back" tab now exists with a live count and a Remarks column; see the "Shipped" entry above. Verified live: a rejected submission correctly appears there with its remarks, and the existing 5 tabs' counts were confirmed unchanged by a live before/after check.
- 🟡 **General undo/reverse still does not exist — deliberately, per the brief.** What was built instead is a *narrow* name-only correction for Verifier/Sanctioner (see the "Shipped" entry above) — it does not cover correcting a wrong Received timestamp, un-verifying, un-sanctioning, or any other field. If Admin needs to undo something beyond a wrong name on Verify/Sanction, the only path is still the full Send Back → resubmit cycle (wipes authority approval, restarts the pipeline, re-notifies everyone). Not built further; report-only for anything beyond the two narrow fixes shipped this session.

## 5. Do Not Touch Without Asking

- `lib/auth.ts` — admin JWT session logic
- `lib/serial.ts` — serial number allocation (gapless guarantee is load-bearing; a "cleanup" here can silently break FY rollover)
- Anything in `lib/db/migrations/` — always ask before editing or regenerating an existing migration; only ever *add* new ones
- The dual representation of `nature_of_expenditure` (structured `cash_voucher_items` for Cash + joined string on `payment_advices.nature_of_expenditure` for NEFT/Excel stability) — this looks redundant but is intentional. Don't collapse it to "just use the line items table" without checking Excel export first.
- PDF route enumeration pattern (UUID-keyed public PDFs, not serial-keyed) — this is a deliberate security choice to prevent bank-detail enumeration, not an oversight.
- **"Other" Recommending Authority resolution never auto-creates a `recommending_authorities` row.** Human explicitly chose "block submission, ask them to contact Admin" over auto-create, to keep the authority list curated (same philosophy as vendors: only Admin creates them). Don't add auto-create behavior here without asking first.
- **`scripts/import-master-data.ts`'s dedupe logic** (case-insensitive staff/authority name matching, `onConflictDoUpdate` on `staff_authority_options`) — this is intentionally *additive-only*; it does not delete or resync a staff member's authority links that existed before but are absent from a later import run. Don't add delete/sync behavior without asking — that's a bigger, riskier change (could silently strip a manually-assigned authority the next time MCCIA sends an updated sheet).
- The 51-vs-52 staff count and the "Pratik Pardeshi has zero authority options" state are both intentional, human-confirmed outcomes of real source-data quirks (an exact duplicate row, and a row with no "Recommended by" value) — not import bugs. See the 2026-07-30 session log entry before assuming either needs fixing.
- **"Waiting on Authority" / "Ready for Finance" are derived from `authority_approved_at`, not a new status enum value** — this was a deliberate choice (see the Approval Workflow entry above) to avoid a second piece of state that can drift out of sync with `status`. Don't add a `PENDING_AUTHORITY` status value without checking every place `status` is filtered/branched on first (admin list, `StatusChip`, `/edit/[token]` validity check, etc.).
- **`authority_token` is intentionally not single-use** (unlike `edit_token`, which is nulled after resubmit) and has a **90-day** TTL, not 14 — both differences are deliberate, not inconsistency with the edit-token pattern. See the Approval Workflow entry above for why. Don't "fix" these to match edit_token without asking.
- **`lib/advice/send-back.ts`'s `performSendBack()` is now shared by Admin's send-back and the Authority's reject action.** Both routes depend on its exact behavior (sets `status`/`sentBackAt`/`adminRemarks`/`editToken` always; sets `authorityRejectedAt`/`authorityRemarks` only when `authorityRejection: true`). Don't fork it back into two copies or change its default (non-authority) behavior without checking both call sites.
- **There is no `/api/admin/advice/[id]/approve` route anymore.** It was retired and folded into `POST /api/admin/advice/[id]/sanction`, which dual-writes `status`/`approved_at`/`approved_by_name` alongside `sanctioned_at`/`sanctioned_by`. Don't recreate a standalone Approve route/button — see the Finance pipeline entry above for the full reasoning. If you need "who approved this," that's `approved_by_name` (still populated, now always one of the 2 fixed sanctioner names instead of free text).
- **`VERIFIER_NAMES` (4 people) and `SANCTIONER_NAMES` (2 people) in `lib/validation/payment-advice.ts` are deliberately hardcoded, not a CRUD-managed table.** Don't build an admin UI to manage these, same philosophy as this repo's other explicit "small fixed list, not a table" decisions. If MCCIA adds/removes a person, that's a one-line code change made by an agent, not a data change made by Admin.
- **`sanctioned_by_name` (submitter-filled) no longer exists — don't confuse it with `sanctioned_by` (admin-recorded) or `verified_by_name` (submitter-filled, PDF footer) vs `verified_by` (admin-recorded, Finance pipeline).** The submitter-filled/admin-recorded pairs look similar but are unrelated concepts that happen to both end up printed near each other on the PDFs. See the Finance pipeline entry above.
- **The Payment Advice PDF (`/api/advice/[id]/pdf`, `/api/admin/advice/[id]/pdf`) 404s for every Cash submission, at every status, no exceptions.** Don't add a code path that serves it for Cash even conditionally (e.g. "for Admin only," "once approved") — the human's instruction was Cash never gets this PDF, full stop. Only the Cash Payment Voucher exists for Cash.
- **`EMAIL_FROM` must stay `onboarding@resend.dev` (the Resend shared testing domain) until the human confirms `mcciapune.com` is DNS-verified in the Resend dashboard.** Don't switch it to a `mcciapune.com` address, and don't touch DNS/attempt domain verification — explicit human instruction, and outside what an agent can even do (needs their IT team).
- **`EMAIL_MODE` must default to `"preview"` for anything other than exactly the string `"live"` — this is deliberate and load-bearing, not a bug.** It's what keeps every environment (including any that forgets to set the var) behaving exactly as it did before Resend was wired up. Don't change the comparison to be more permissive (e.g. truthy-check) without asking.
- **`notifyAuthorityApproval()`'s `to` parameter is `string | null`, not `string` like the other three notify functions** — deliberately, since ~2/13 recommending authorities have no email on file and must silently fall back to preview (never throw, never block the calling route) rather than erroring. Don't change its signature to require a non-null email.
- **`lib/staff-authority-emails.ts`'s `NAME_EMAIL_LIST` is the single authoritative source for staff/authority emails** — `scripts/backfill-staff-authority-emails.ts` and `lib/staff-email.ts` both import from it rather than duplicating the list or the name-normalization logic. If MCCIA sends an updated email list, edit this one file and re-run the backfill script; don't hand-edit DB rows or create a second list.
- **Never assume the `vi.mock`/`vi.fn().mockImplementation()` pattern for mocking a class constructor is broken across a whole test file just because one test fails and the same test passes in isolation — check `afterEach`/`beforeEach` for `vi.restoreAllMocks()` first.** It silently strips `mockImplementation` from plain `vi.fn()`s (not just spy state, despite the name), which only manifests as failures once 2+ tests share the mock. Cost real time to root-cause in this session (see the session log entry below) — don't rediscover it the hard way again.
- **Recommending Authorities are managed inline on `/admin/staff` (`components/admin/AuthoritiesSection.tsx`), not a standalone `/admin/authorities/[id]` page** — this is a deliberate continuation of the earlier Staff/Authority Roster session's "one page" consolidation. Don't reintroduce a separate authorities page without checking; extend `AuthoritiesSection`'s inline create/edit form instead.
- **The deactivation safety check (staff + authorities, `lib/advice/deactivation-safety.ts`) is NOT a hard block — it's a warn-then-confirm gate.** `PATCH` returns 409 with `{error, inProgressCount}` when deactivating something with in-progress dependents and no `force: true` in the body; the UI shows `window.confirm()` and retries with `force: true` if the admin agrees. Don't change this to a hard block (the human explicitly wants "confirm and continue if they choose," not "cannot deactivate") and don't remove the `force` escape hatch.
- **`countInProgressForStaffName()` matches by name, not FK** (`payment_advices` has no `staff_member_id` column) — it is a best-effort approximation, not a reliable reference check. Don't present its result as exact, and don't "fix" it by adding fuzzy matching without asking — the human may want a real FK instead, which is a bigger schema change.
- **The Verifier/Sanctioner "Correct name" action is a narrow name-only fix, not undo/reverse — don't extend it into general undo without asking.** It exists as `PATCH` on the same `verify`/`sanction` route files that already have `POST` (not new route paths) — keep that pattern if extending it. `PATCH .../sanction` deliberately also updates `approved_by_name` alongside `sanctioned_by` (flagged in the Shipped entry above) since it's a dual-write mirror of the same fact; `PATCH .../verify` has no equivalent second field to sync. Neither PATCH ever touches `verified_at`/`sanctioned_at`/`status`/`bill_passed_for` — don't add that without asking, it would turn a name fix into an undo.
- **The "Sent Back" tab's Remarks column reads `admin_remarks`, not `authority_remarks`.** `admin_remarks` is always set by `performSendBack()` regardless of who triggered it (Admin or the Authority); `authority_remarks` is only set for authority rejections specifically and would be blank for Admin-initiated send-backs. Don't switch the column to `authority_remarks` — it would silently go blank for half the rows.

## 6. Session Log

Append one entry per session, newest at the top. Keep entries short — this is a changelog, not a diary.

```
2026-07-31 — Claude Code — Shipped the two narrow fixes Task B's audit
flagged, explicitly not touching tab filter logic/API gating/the (a) Received-
vs-In-Process question (still awaiting the human's answer). Fix 1: added a
6th admin tab "Sent Back" (buildTabCondition keys on status=SENT_BACK, added
alongside the existing 5, none of which changed) with a live count and a
Remarks column (sources admin_remarks, which is always set regardless of who
sent it back, not authority_remarks which is only set for authority
rejections). Fix 2: narrow name-only correction for Verifier/Sanctioner —
confirmed VERIFIER_NAMES/SANCTIONER_NAMES unchanged before starting, per the
human's explicit ask. New PATCH handlers on the existing verify/sanction
route files (not new paths): correct just verified_by or sanctioned_by,
never touch verified_at/sanctioned_at, write a VERIFIER_NAME_CORRECTED/
SANCTIONER_NAME_CORRECTED audit_log entry with old+new name. Flagged one
judgment call: PATCH .../sanction also updates approved_by_name alongside
sanctioned_by, since that field is a dual-write mirror from the original
Sanction action and is what Excel's "Approved By" column actually reads —
leaving it stale would make the correction not show up on the real document.
New UI: NameCorrectionAction.tsx, a small button-that-expands-to-a-select,
wired into the admin detail page next to Verified By/Sanctioned By only
(confirmed live via the rendered HTML: exactly 2 "Correct name" controls,
none near Received & In Process). New/extended tests: filters.test.ts
(sent_back regression guard), both finance-verify/sanction-route.test.ts
files gained PATCH describe blocks. Full live verification against the real
dev server + real Neon DB: before/after tab-count check proved the existing
5 tabs are byte-for-byte unchanged; rejected a real submission and confirmed
it surfaces correctly in Sent Back with remarks; ran a real advice through
verify-with-wrong-name → corrected it → confirmed via direct SQL that
verified_at didn't move a millisecond while verified_by did, and the audit
trail shows both names; same for sanction, plus confirmed the corrected name
actually reached the Excel export's shared strings. All test data cleaned up
after — DB back to its single pre-session baseline row. tsc/ESLint/Vitest
(132 passing, 2 pre-existing skipped)/next build all clean.

2026-07-31 — Claude Code — Small follow-up to Task A: added an inline amber
warning to the Authority edit form (edit mode only, not create) per the
human's request — renaming an authority retroactively affects every
historical PDF/approval page it's referenced on (recommending_authority_id
is a live FK, per Task A's §4 finding), so the form now says so and
recommends deactivate+create-new for an actual personnel change instead of a
rename. tsc/ESLint clean, live-checked the warning is absent on page load
(create mode) and present in the edit-mode code path.

Then Task B per the same brief: audited the Finance Pipeline's status logic
against the human's stated 8-step intended workflow, no code changes (report
only, as instructed). (a) Asked directly, did not decide: should "Received"
and "In Process" (currently one combined finance_received_at timestamp)
become two separate steps? Blocking on the human's answer before any schema
work. (b) Documented the exact filter condition for all 5 tabs — no bug
found. (c) Live-tested the full skip-ahead + double-action matrix via direct
curl calls against every one of the 3 pipeline routes (receive/verify/
sanction) — every out-of-order transition correctly 409s server-side, not
just UI-hidden; no gating bug found. (d) Confirmed live that a
authority-rejected submission is excluded from all 5 tabs but not lost —
only reachable under "All" — and flagged that nothing proactively surfaces
it (no badge/count/dedicated tab). (e) Confirmed via a real live-tested
advice's full audit_log trail that every current transition (submit,
authority approve, send-back/reject, receive, verify, sanction) writes an
audit entry with the correct actor — no gap. (f) Confirmed via grep and
route inspection that no undo/reverse mechanism exists anywhere — the only
reset path is a full resubmission that also wipes authority approval,
flagged as a gap, not built. All test data (3 advices across Task A follow-
up + Task B) cleaned up after. tsc/Vitest (121 passing) re-confirmed clean;
no build/lint changes needed since no application code changed in the Task B
portion. Reported back per the brief's explicit "report only" instruction on
(d)/(e)/(f) and stopped without touching schema, pending the human's answer
to (a).

2026-07-31 — Claude Code — Task A per the human's brief: audited real state of
Vendor/Staff/Authority admin CRUD before writing any code (human suspected
only Create worked, contradicting a prior "CRUD built" summary). Confirmed:
Vendors already fully correct. Staff Edit existed but never had an email
field (create or edit) despite the column existing since migration 0006.
Authority Edit did NOT exist anywhere in the UI — only Create + an
isActive-only toggle — confirming the human's suspicion. Fixed all three:
added email to staffMemberFormSchema/StaffForm/staff routes; built
AuthoritiesSection.tsx (inline create+edit, replacing the create-only
NewAuthorityInlineForm, keeping the deliberate "inline on /admin/staff, no
standalone page" design) with full authorityName/email edit wired to the PATCH
route that already silently supported it. Built the §3 safety check
(lib/advice/deactivation-safety.ts): reliable FK-based count for authorities,
best-effort name-match for staff (flagged as approximate — no FK exists);
both PATCH routes 409 with {error, inProgressCount} unless {force:true},
UI catches it with window.confirm()+retry. Found and fixed a real bug while
auditing §2's dropdown-disappearance requirement: /api/staff/search's
authority-options join never filtered recommendingAuthorities.isActive, so a
deactivated authority still offered itself as a selectable option for a
staff member's NEW submission — fixed with one added eq() clause. §4 audit
(report only, no changes): submitted_by_name and vendor payee fields are
snapshotted plain text at submission time; recommending_authority_id is a
live FK — every PDF/admin-detail/authority-approval view re-joins to
recommending_authorities at render time, so renaming an authority
retroactively changes what historical PDFs show if re-downloaded. New test
file lib/advice/deactivation-safety.test.ts (4 tests, unit-level for the two
count functions); route-level 409/force behavior verified live instead of
mocked, same rationale as prior sessions for db.transaction-heavy routes.
Full live verification against the real dev server + real Neon DB: created
test authority → edited name+email → submitted a real advice against it →
deactivate blocked 409 (count=1) → forced through (200) → confirmed the
historical PDF and admin detail page still show the deactivated authority's
name correctly → confirmed it's gone from the public form. Created a linked
test staff member → confirmed the search-endpoint bug fix (authorityOptions:
[] for the now-inactive authority) → renamed the staff member to match the
test advice's submittedByName exactly → confirmed both the toggle-only and
full-edit-form PATCH paths 409 correctly, force succeeds, reactivate has no
check. Vendor edit re-confirmed still correct. All test data cleaned up
after. tsc/ESLint/Vitest (121 passing, 2 pre-existing skipped)/next build all
clean. Per the human's explicit instruction, STOPPED here and reported back
rather than starting Task B (Finance Pipeline status-logic audit) — Task B
depends on the human's answer to one schema question (combine vs. split
Received/In-Process) before any code can be written for it.

2026-07-30 — Claude Code — Human added a test recommending authority "AI
Studio" (aistudio@mcciapune.com) and asked for live-send testing against it;
reported the received email's MCCIA logo looked squished. Root-caused:
templates.ts's shared email header hardcoded the logo <img> to 56x56
(square), but the real source image is 1085x258 (a wide wordmark, ~4.2:1)
— confirmed by downloading and inspecting it directly. Fixed to 160x38 to
match the real aspect ratio; applies to all 4 templates since they share one
header. While testing, briefly unset EMAIL_TEST_OVERRIDE_RECIPIENT to try a
direct (non-redirected) send to aistudio@mcciapune.com and hit a real Resend
403: the shared onboarding@resend.dev sending domain can only deliver to the
account owner's own address, full stop — every other recipient is rejected
until a real domain is verified. Existing error handling caught this cleanly
(no crash, no code change needed). Restored the override recipient
immediately after the one test. Flagged this as a bigger-than-cosmetic open
item — no one but the account owner can receive real email from this app
until mcciapune.com is verified in Resend and EMAIL_FROM points at it. Test
rows cleaned up. tsc/Vitest (117 passing) unaffected.

2026-07-30 — Claude Code — Ran the manual Resend live-send verification that
was blocked on a RESEND_API_KEY (the human added it, plus EMAIL_MODE=live
and EMAIL_TEST_OVERRIDE_RECIPIENT, to .env.local). Restarted the dev server
to pick up the new env vars (notify.ts caches the Resend client at module
load). Drove two real submissions: one through an authority WITH an email
on file (Neeraj Thakur) — both notifySubmissionConfirmation and
notifyAuthorityApproval returned real Resend message IDs, override redirect
confirmed working in the logs; one through an authority with NO email (DG)
— submission confirmation sent live, authority approval correctly fell back
to preview with the expected warning log and made zero Resend calls. Could
not visually confirm inbox delivery/logo rendering/subject prefix myself (no
inbox access) — downgraded the open item from blocking-red to
verify-pending-yellow rather than closing it; the human needs to check the
override inbox and report back. Test rows + Blob attachments cleaned up
after. EMAIL_MODE is live only in local .env.local — production untouched.

2026-07-30 — Claude Code — Removed the submitter-filled "Verified By" field
from the public form, per the human noticing it was still there ("submitters
won't be putting that info"). Migration 0007 drops verified_by_name (checked
the real DB first — only 1 row existed, same-day test data, safe to drop).
Removed the field from the form/Zod schema/form-data parsing/submit+edit
routes. Renamed the PDF footer's "Verified by" box from the removed
submitter field to the admin-recorded verifiedBy (Finance pipeline) —
mirrors sanctionedBy's existing nullable/blank-until-verified pattern
exactly, finishing a cleanup the Finance-pipeline session had already done
for "Sanctioned by" but flagged-and-left for "Verified by." Removed the dead
"Verified By (on form)" row from the admin detail page. Also fixed a stale
README paragraph that hadn't been updated when sanctioned_by_name was
dropped earlier. Verified live: form HTML has no "Verified By" field, a real
submission succeeds without it, the PDF downloads with a correctly-blank
Verified-by box, admin detail page shows the dead row is gone while Finance
Pipeline's real Verified By status still works. Test row + attachments
cleaned up. tsc/ESLint/Vitest (117 passing)/build all clean.

2026-07-30 — Claude Code — Combined task per the human's brief, Part A
(import real staff/authority email data) then Part B (turn on real email
sending via Resend, gated by EMAIL_MODE). Part A: caught and flagged that
recommending_authorities.email already existed (brief assumed it didn't) —
migration 0006 only adds staff_members.email. Backfill script matched all 39
authoritative list entries to staff (0 unmatched), 11/13 authorities (DG
expected-unmatched per the brief, "S H Kopardekar" genuinely unmatched,
flagged). Fixed VERIFIER_NAMES "Aabha"->"Abha" Khatavkar after confirming
zero existing verified_by rows needed reconciling. Built
resolveStaffEmailByName() (no live call site — flagged, not invented one)
and the "Your Email" auto-fill (extracted to a pure function since this repo
has no React Testing Library/jsdom anywhere, matching its established
"verify UI live, not via component tests" convention). Part B: added
resend, EMAIL_MODE/EMAIL_FROM/EMAIL_TEST_OVERRIDE_RECIPIENT env vars
(EMAIL_FROM left at onboarding@resend.dev exactly as instructed, no
mcciapune.com attempt), rewrote lib/email/notify.ts only (templates.ts
untouched) — preview mode unchanged, live mode sends via Resend with the
override-redirect+subject-prefix behavior, Resend failures caught and
logged never thrown, notifyAuthorityApproval falls back to preview without
throwing when an authority has no email. All 4 notify functions now async
with a `to` param, awaited at every call site (required for Vercel
serverless correctness, not just style). Root-caused a real, non-obvious
test bug along the way: vi.restoreAllMocks() in afterEach was silently
wiping the mocked Resend class's mockImplementation (not just spy state),
which only broke tests once 2+ ran in the same file — cost real time to
isolate via a from-scratch minimal repro; documented in §5 so it isn't
rediscovered blind. 41 new tests, 2 pre-existing route tests updated for
the new signatures/spelling; 115 total passing. Verified live against the
real dev server + Neon DB: /api/staff/search returns real backfilled
emails, a real submission in default (preview) mode logs both email
previews with zero Resend calls — confirms default behavior is genuinely
unchanged. Did NOT complete the brief's required manual live-send
verification — no RESEND_API_KEY supplied this session (human said they'd
provide it separately); flagged as a 🔴 open item, EMAIL_MODE left at
"preview" everywhere. Could not check Resend's mcciapune.com domain
verification status — no dashboard access; per the brief, did not attempt
to touch DNS. `tsc`, ESLint, Vitest, and production build all pass.

2026-07-30 — Claude Code — Three-part task per the human's brief: (1) Cash
submissions never get a Payment Advice PDF anywhere (both PDF routes,
confirmation screen, AdviceActions, and the submission-confirmation email
now all Cash-aware — only the Cash Voucher exists for Cash); (2) new Finance
Verification + Sanctioning pipeline (migration 0005: 5 new nullable
columns, sanctioned_by_name dropped — human explicitly confirmed dropping
it after I found and reported the one row with a non-null value; hardcoded
4-person VERIFIER_NAMES / 2-person SANCTIONER_NAMES lists, not a table;
three new routes receive/verify/sanction with the same double-action-
prevention shape as the Approval Workflow's routes; old free-text Approve
route deleted and folded into Sanction, which dual-writes
status/approved_at/approved_by_name so Excel export and the PDF header need
zero changes — flagged this choice rather than guessing, same as the
hide-vs-disable call last session; admin queue grew from 3 to 6 tabs;
AdviceActions reworked into one action panel per stage); (3) new
renderVerifiedEmail()/notifyVerified(), house-styled, fired at verify time
only (not receive/sanction, per the brief). 21 new/updated test files, 75
tests passing. Verified live end-to-end against the real dev server + real
Neon DB: ran one NEFT and one Cash advice through the entire pipeline,
every stage-ordering/double-action guard confirmed 409/400, Verified email
confirmed correct, dual-write confirmed in both the DB and a real
downloaded PDF, Payment Advice PDF confirmed 404 for Cash at every stage.
Test rows deleted after. Accidentally crashed the already-running dev
server's build cache with an `rm -rf .next` (run to clear a stale
TypeScript error, unrelated to app code) and had to restart it
(`pkill -f "next dev" && npm run dev`) to recover — this is what killed the
previously-tracked background dev-server task; a fresh untracked one is
running in its place now. `tsc`, ESLint, Vitest, and production build all
pass.

2026-07-30 — Claude Code — Fixed the same-filename attachment Blob collision
flagged as a 🔴 open item in the previous session. `/api/edit/[token]` and
`/api/submit/route.ts` both built a deterministic Blob pathname from
serialNo+docType+fileName with no overwrite/uniqueness handling; a resubmit
replacing an attachment with a same-named file 500'd. Fixed by adding
`addRandomSuffix: true` to both `put()` calls, not `allowOverwrite` (would
have let new bytes land at the old pathname before the DB transaction
confirms the swap — see §4 for the full reasoning). New regression test
(`lib/advice/edit-resubmit-attachment-collision.test.ts`) mocks Vercel
Blob's real collision behavior closely enough that it fails against the
pre-fix code (verified via an included sanity-check test). Also verified
live: real dev server + real Neon DB, reject → resubmit with an identical
filename → 200 (previously 500), new file fetched back correctly. Test rows
deleted after. `tsc`, ESLint, Vitest (44 passed, 2 pre-existing skipped),
and production build all pass. Scope was exactly the reported bug — did not
touch the Approval Workflow logic itself beyond these two `put()` calls.

2026-07-30 — Claude Code — Built the Approval Workflow feature (Recommending
Authority must approve/reject before Admin can approve), per the human's
brief. Full scope: schema migration `0004_giant_starjammers.sql` (5 nullable
authority_* columns on payment_advices, no new status enum value); shared
`lib/advice/send-back.ts` extracted from Admin's existing send-back route so
Authority reject reuses the identical edit-token flow; `lib/advice/
authority-token.ts` (90-day TTL, not single-use — see §5); new public
`/authority-approval/[token]` page + 3 API routes (approve/reject/attachment
view); admin approve route gated 409 until authority_approved_at is set;
AdviceActions relabeled (hides Approve, shows waiting/approved status +
copy-link) rather than just disabling the button; admin queue split into
Waiting on Authority / Ready for Finance / All tabs; copy-link added to both
the admin detail view and the submitter's /submitted/[serial] screen;
notifyAuthorityApproval()/notifySentBack() wired at submit, resubmit, and
authority-reject. 10 new/updated test files, 42 tests passing (unit tests for
the token helper, the migration SQL, tab-condition logic, and both new
routes' double-action/expiry guards — full transactional success paths for
submit/resubmit were verified live against the real dev server + real Neon
DB instead of mocked, since this repo has no existing convention for mocking
db.transaction and inventing one risked a brittle test). Full live
verification: submit → approve blocked pre-authority → authority approves →
double-open shows read-only banner + 409 on reuse → admin approve now
succeeds; separate submission → authority rejects with remarks → SENT_BACK →
resubmit → authority fields reset + fresh token issued + new approval email
logged; queue tab counts confirmed correct throughout. Test rows deleted
after verification. Found but did NOT fix a pre-existing, unrelated bug in
/api/edit/[token]'s attachment re-upload (same-filename Blob collision) —
see §4. `tsc`, ESLint, Vitest, and production build all pass.

2026-07-30 — Claude Code — Investigated the "Approval Workflow" feature
(authority-facing approval token/link, `authority_approved_at`/
`authority_rejected_at`/`authority_remarks` columns, authority approve/reject
page, admin queue split into "Waiting on Authority"/"Ready for Finance") at
the human's request, after a prior handoff note described it as "unmerged."
Confirmed it was **never built anywhere** — not a merge/sync gap. Checked
four ways: (1) `git log --oneline -20` and `git branch -a` — 10 commits
total, all on `main`, no other local or remote branches, nothing dangling;
(2) live Neon schema via `psql \d payment_advices` — no such columns exist;
(3) full source search — no authority token route, no approve/reject page,
no queue-split logic anywhere; (4) `git status`/`git diff` — the only
uncommitted local work was Codex's unrelated email-template-preparation
session, which merely *references* this feature as a documented future
dependency, not an implementation of it. Corrected the misleading "unmerged"
language in §3 and §4 (previously implied the code existed somewhere but
hadn't landed) to state plainly that the feature has not been built. Docs-
only change — no code, schema, or route touched.

2026-07-30 — Codex — Added provider-free email preparation from the three
supplied HTML designs: typed, escaped render functions in
`lib/email/templates.ts`, plus preview-only notification wrappers in
`lib/email/notify.ts`. Wired only the currently available call sites:
submission confirmation and existing Admin send-back (`sentBackBy: "Admin"`).
Authority approval is deliberately exported but uncalled because its Approval
Workflow route has not landed; authority send-back is likewise recorded as an
open item. No provider SDK, API key, queue, retry, or delivery tracking was
added. Added template coverage (subjects, full substitution, HTML escaping,
Cash button omission/inclusion). `tsc`, ESLint, Vitest (17 passed, 2
pre-existing DB integration tests skipped), and production build all passed.

2026-07-30 — Claude Code — Staff/Authority Roster + Vendor Import, per
Staff_Authority_Vendor_Import_ClaudeCode_Prompt.md (repo root). Full
scope: §1 schema migration, §2 staff/authority import, §3 vendor
import, §4 reusable import script, §5 public form UX + /admin/staff,
§6 vendor typeahead unaffected — all shipped and verified. Did NOT
touch §8's approval-workflow boundary (explicitly out of scope this
session, per the prompt itself).

Two real ambiguities found in the actual source data (not guessed):
"Aishwary Songirkar" is an exact duplicate row (rows 42+45, same name,
same authority) — human chose dedupe to 1 (51 staff total, not 52).
"Pratik Pardeshi" (row 15) has no "Recommended by" value at all —
human chose: create the staff row anyway, zero authority options,
Admin fills in later via /admin/staff. Also asked and got an answer on
a genuine schema gap before writing any form code: since
recommending_authority_id stays a NOT NULL FK, what happens when a
free-text "Other" value matches no existing authority? Human chose
block-submission-not-auto-create — this reuses the pre-existing
required-UUID Zod validation, no new validation code needed.

Also found real pre-existing data during the "verify no existing
payment_advices reference the old authorities" check the prompt asked
for: 4 payment_advices rows did reference them (obviously the human's
own manual browser tests — payee "MCCIA", attachments named
"Attendance Hackathon" — not real business data). Confirmed with the
human before deleting; deleted them plus their attachments/audit_log
rows plus the orphaned Blob files.

Migration 0003_staff_authority_roster.sql was hand-written (SQL +
snapshot JSON), not drizzle-kit generate'd — see §5. Verified correct
via `drizzle-kit generate` reporting zero diff afterward, and by
applying it to the real DB and checking `\d` output directly.

Found and fixed one real runtime bug during live-testing (not caught
by tsc/eslint): PATCH /api/admin/staff/[id]'s active-toggle path used
`staffMemberFormSchema.pick(...)`, which Zod rejects at runtime on a
schema with `.superRefine()` attached. Only surfaced by actually
clicking (curling) the toggle — a reminder that schema/type checks
don't catch every Zod API misuse.

Ran the import twice against the real DB (first run's vendor step got
interactively prompted and was killed mid-prompt after the
staff/authority half had already committed; second run with a cleared
junk test vendor completed cleanly) — this incidentally became a live
idempotency proof: the second run reported 0 new staff/authorities
created, 51/13 correctly reused. Also caught and fixed a cosmetic-only
report bug this exposed: the "reused" list was logging each row's raw
casing instead of the canonical stored casing, making correctly-deduped
authorities look duplicated in the printed report even though the DB
was always correct (verified directly via SQL both before and after
the fix).

Full live end-to-end verification against the real dev server + real
Neon DB (all test data cleaned up after): /api/staff/search for 4 real
edge cases (1-option/2-option/0-option/no-match), a real NEFT
submission through /api/submit using a real staff member + their real
authority (PDF correctly printed "Chintamani Shrotri" under
"Recommended by"), vendor typeahead against the real 660-row import,
full staff admin CRUD lifecycle (create with 2 authorities → edit to
1 different authority → toggle inactive → confirm it disappears from
public search), and /edit/[token] loading correctly for a SENT_BACK
record under the new schema. Not verified: the typeahead/radio
components' actual browser interaction (no browser automation
available this session — see §4).

tsc/eslint/vitest/`next build` all clean. Committed and pushed
everything from this session as commit `1130818`.

2026-07-29 — Claude Code — Committed Codex's Cash Payment Voucher work
(commit b198449), on explicit human instruction, after independently
reviewing the full diff file-by-file first (not a blind `git add -A`).
Before committing: ran tsc/eslint/full vitest suite/`next build`, all
clean. Live-tested a real Cash submission end-to-end through the actual
/api/submit route (not mocks) — correct DB rows, correct joined
nature_of_expenditure, both PDFs render. Also resolved the remaining
open item from the entry below: live-verified the admin detail view
renders the itemized breakdown (moved to 🟢 in §4). Excel/Tally export
column-order item is still unverified — nobody has checked it yet.
Cleaned up all test rows/blobs created during verification. §4 and §3
updated to reflect commit hash; the "uncommitted work" flag from the
previous session no longer applies.

2026-07-29 — Claude Code — Verification pass on §4 open items. Committed
and pushed AGENT_HANDOFF.md only (13c6140) — nothing else in the working
tree. Verified open item #1 (cash-voucher-pdf 404 for NEFT) live against
real dev server + real Neon DB, both routes correct; no fix needed;
strengthened the existing mocked test in cash-voucher-routes.test.ts to
also assert non-PDF content-type, not just status code. Verified open
item #2 (the 2 skipped DB tests) with git evidence: pre-existing, from
the initial commit, unrelated to Cash Voucher. Did not unskip them.
IMPORTANT for next session (either agent): the entire Cash Payment
Voucher feature described in §3 as "Shipped" is NOT actually committed
to git anywhere — `git status` shows it as ~20 modified/untracked files
still sitting in the working tree, never pushed. §3's "Shipped" wording
is accurate for what exists on disk, not for what's in version control.
Did not touch, stage, or commit any of it (out of scope for this
session) — flagging so nobody assumes it's safe on a remote.
```

## 7. Reference: Cash Voucher field mapping (paper → app)

| Paper form field | App field | Notes |
|---|---|---|
| Pay to | Name of the Payee | renamed |
| Particulars | Nature of Expenditure | renamed, now a repeatable line-item list |
| Prepared by | Submitted by | renamed |
| Checked by | Recommended by | renamed |
| Debit to | *(removed)* | — |
| A/c Code | *(removed)* | — |
| Amount in Words | *(removed)* | — |
| Sanctioned by | Sanctioned by | kept, but now filled by submitter at submission, not Admin at approval |
| Payee's Signature | Payee's Signature | kept, blank on printout (wet-ink) |
| No. | No. | kept — reuses Payment Advice `serial_no` |
| Date | Date | kept |
| Rs./Ps. columns, Total | Rs./Ps. columns, Total | kept, Total now auto-summed from line items |

---

*End of handoff file. Both agents: read §0 again before starting work.*
