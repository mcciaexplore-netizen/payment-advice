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

**Last updated:** 30 July 2026, by Claude Code (removed the stale submitter-filled "Verified By" field from the public form)

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
- 🔴 **Manual live-send verification is NOT done — blocked on a real `RESEND_API_KEY`, which the human said they'd supply separately and had not by the end of this session.** Everything else (schema, backfill, notify.ts wiring, all 41 new tests, preview-mode-unchanged live check) is verified; only the actual "does an email really arrive in a real inbox, does the MCCIA logo render, does the subject prefix show up" check is outstanding. **Do not mark this feature fully done, and do not flip `EMAIL_MODE=live` anywhere, until a human has run this check** (set `EMAIL_MODE=live` + `EMAIL_TEST_OVERRIDE_RECIPIENT` to a real inbox locally, trigger a real submission, confirm delivery — then repeat for `notifyAuthorityApproval` once with an authority that has an email on file and once with one that doesn't, confirming the second case logs a fallback-to-preview warning and does NOT hit Resend).
- 🟡 **Recommending Authority "S H Kopardekar" has no email on file and doesn't match any name in the authoritative list** (distinct from "SUDHANWA KOPARDEKAR," which does match) — will fall back to preview mode for `notifyAuthorityApproval` indefinitely until the human either gets their real email or confirms this is meant to be the same person as an existing matched entry (possibly a data-entry variant, not a genuinely different person — not confirmed either way this session, flagging rather than guessing).
- ⬜ **Resend `mcciapune.com` domain verification status is unknown** — no Resend account/dashboard access this session. Per the brief's explicit instruction, did not touch DNS or attempt domain verification; `EMAIL_FROM` is left at the shared `onboarding@resend.dev` testing domain. The human needs to confirm domain status directly in the Resend dashboard before ever pointing `EMAIL_FROM` at a `mcciapune.com` address.
- 🟡 **`lib/staff-email.ts`'s `resolveStaffEmailByName()` has no live call site** — built and unit-tested per the brief's explicit request (resolve the 6 Verifier/Sanctioner names against the staff table), but nothing in this session's scope actually emails a verifier or sanctioner, so it isn't wired into any route. Likely forward-looking infrastructure; don't assume it's dead code to be deleted without checking with the human first.

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

## 6. Session Log

Append one entry per session, newest at the top. Keep entries short — this is a changelog, not a diary.

```
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
