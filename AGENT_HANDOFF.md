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

**Last updated:** 4 September 2026, by Codex (applied confirmed first-name Authority passwords)

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
- ~~Voucher "No." reuses the Payment Advice `serial_no` — no separate numbering series~~ **Superseded 2026-08-01** — the Cash Voucher now has its own independent series (`cash_voucher_no`, format `CASH/MCCIA/<FY>/NNNN`); see the "Shipped — Kopardekar authority merge, Cash Voucher numbering series, admin tab UI restyle" entry further down for the current behavior.
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

### Verified — Full live-send verification of all 4 notification emails (Claude Code, 2026-07-31)
Pure verification session, no code changed. The human set a real `RESEND_API_KEY`, `EMAIL_MODE="live"`, and `EMAIL_TEST_OVERRIDE_RECIPIENT` (their own inbox) in `.env.local` and asked for full live verification of every notify path. `EMAIL_FROM` was left unset (defaults to `onboarding@resend.dev` in code) — confirmed, not changed.

**Discrepancy found before testing, exactly the kind the human asked to be caught rather than assumed:** the human said they'd just added `sudhanwak@mcciapune.com` to "S H Kopardekar" via the Admin UI. Checked the DB directly — **"S H Kopardekar" still has no email.** The email landed on **"SUDHANWA KOPARDEKAR"**, a separate, distinct row that's had that exact email since the very first backfill (2026-07-29, before this edit) — these are almost certainly the same real person recorded twice, and the edit appears to have hit the wrong row. Proceeded with "SUDHANWA KOPARDEKAR" for the authority-with-email test (it genuinely has the email, so the code path still got exercised correctly), but this needs the human's attention — see the open item below.

**§0 sanity checks — all confirmed by reading the code (`lib/email/notify.ts`) and by triggering real sends, not by trusting the docs:**
- Restarted the dev server (`.env.local` is only read at Next.js startup) and confirmed via the startup log (`Environments: .env.local`) plus real Resend message IDs in subsequent sends that `EMAIL_MODE=live` and the override were actually being read.
- `EMAIL_FROM` is unset in `.env.local` → `getFrom()` returns the `"onboarding@resend.dev"` default, confirmed by reading the code (no way to inspect the outgoing "from" header without inbox access, but the code path is unambiguous and unchanged from the last session's work).
- Override mechanism read directly from source: `const recipient = override || to` (always wins when set, regardless of the real recipient) and `` const subject = override ? `[TEST — would go to: ${to}] ${message.subject}` : message.subject `` — the prefix always names the **real** intended recipient (`to`), not the override address. Confirmed live in every test below via the `"(redirected from {real address})"` log line `send()` emits.

**All 5 tests — pass, with real evidence (not just "it worked"):**
1. **Submission confirmation (NEFT).** Submitted via `/api/staff/search` (real typeahead resolution — no browser automation tool exists in this environment, flagged rather than silently claimed) + `/api/submit`, using a real staff member (Aishwary Songirkar, real email on file) whose auto-fill resolved a real linked authority (Neeraj Thakur). Server log: `[Email sent: submission confirmation] to {override} (redirected from aishwary.fellow@mcciapune.com), id 7d205018-...` — real Resend message ID, not a preview log. Independently re-rendered `renderSubmissionConfirmationEmail()` with the exact same data the route used (pulled straight from `app/api/submit/route.ts`'s call site) to get the literal subject/body without needing inbox access: subject `"Payment Advice MCCIA/2026-27/0029 Submitted"`, body confirmed to contain the correct serial no, amount (₹4,567.89), payee name, authority name, and a working Payment Advice PDF link — **no Cash Voucher link present**, correct for NEFT.
2. **Authority approval, authority WITH email.** Used SUDHANWA KOPARDEKAR (see discrepancy above). Log: `[Email sent: authority approval] to {override} (redirected from sudhanwak@mcciapune.com), id 495d05cd-...`. Clicked through the real `/authority-approval/[token]` link from the actual generated token — 200, correctly loaded serial `MCCIA/2026-27/0030`, the right payee, and the right amount.
3. **Authority approval, authority WITHOUT email (DG).** Submission succeeded normally (200), no error, no throw. Server log: `"No email on file for authority DG, falling back to preview."` followed by a full `[Email preview: authority approval]` dump (not a Resend call) — exactly the documented graceful fallback. **Confirmed real gap, per the human's specific ask: there is NO admin-facing indication anywhere that this happened.** Checked the admin detail page's rendered HTML directly — it shows `"DG · Awaiting approval"` and a generic `"Copy link to share with DG"` button, identical to what's shown for an authority that DOES have an email and WAS actually notified. Nothing distinguishes "the automated email actually went out" from "nobody was notified, share this manually." Not fixed this session (more than a one-line change — needs the detail page's authority query extended to select `email`, plus new conditional UI); see the open item below.
4. **Sent-back email (Admin's own Send Back action).** Fired correctly: `[Email sent: sent back] to {override} (redirected from {submitter}), id 589a1e88-...`. Re-rendered `renderSentBackEmail()` with the exact route data to confirm subject `"Action Required: Payment Advice MCCIA/2026-27/0032 Sent Back"` and that the actual remarks text ("Please attach the correct GST invoice, this one is illegible") and a working edit link both made it into the body.
5. **Verified email, fires only at Verify.** Ran a real advice through authority-approve → Received & In Process → Verify. Server logs confirm **zero** email activity (no send, no preview) at either the approve or receive steps — only `[Email sent: verified] ... id e59e2a69-...` after the Verify call. Re-rendered `renderVerifiedEmail()` to confirm subject `"Payment Advice MCCIA/2026-27/0030 Verified"` with the correct verifier name, serial, and amount in the body.

All 4 test submissions + their attachments/Blob files deleted afterward; DB confirmed back to its single pre-session baseline row.

**Flags for the human, per the brief's explicit ask:**
- **"S H Kopardekar" still has no email — the edit landed on "SUDHANWA KOPARDEKAR" instead.** Needs the human to either redo the edit on the correct row, or confirm these should actually be merged/treated as one person (see the pre-existing open item below, now sharpened).
- **§3's no-email case has a real, confirmed admin-visibility gap** — flagged, not fixed. Recommend a follow-up session add something like "⚠ No email on file — share this link manually" next to the Copy Link button when `authority.email` is null.
- **Deliverability**: `onboarding@resend.dev` is a **shared** sending domain used by every Resend account in testing mode — recipient mail servers have no reason to trust MCCIA's sending reputation specifically through it, and (already confirmed in an earlier session) Resend hard-blocks it from sending to anyone but the account owner at all. This isn't a "might land in spam" risk once real recipients are added — **it is technically incapable of reaching anyone but the account owner, full stop**, until `mcciapune.com` is verified in Resend. Once it is, a fresh deliverability check (inbox vs. spam placement, SPF/DKIM alignment) against the new domain is still needed — nothing about that was or could be tested today.
- **Confidence on flipping `EMAIL_MODE=live` without the override**: the send/redirect/fallback/error-handling logic itself is now thoroughly verified from every angle in this session and is not a concern. What's *not* yet tested, because it can't be until the domain is verified, is real-world delivery through `mcciapune.com` as the `from` address — different SPF/DKIM/reputation situation than the shared testing domain entirely. Recommend keeping the override on for the first real send or two after `EMAIL_FROM` changes to a `mcciapune.com` address, purely to catch anything specific to that domain (typo in the address, DNS record issue, etc.) before it reaches real staff/authorities/submitters — not because anything found today suggests a code problem.
- `EMAIL_MODE`/`EMAIL_TEST_OVERRIDE_RECIPIENT` were left exactly as the human set them in `.env.local` (local-only, gitignored) — nothing committed changed either.

### Shipped — Kopardekar authority merge, Cash Voucher numbering series, admin tab UI restyle (Claude Code, 2026-08-01)
Three independent fixes, done and verified in order.

**Fix 1 — Merged the duplicate "S H Kopardekar" / "SUDHANWA KOPARDEKAR" authority.** Confirmed the human's real-world knowledge that these are the same person recorded twice (flagged as an open item in the previous session). "S H Kopardekar" had **0** `payment_advices` references and **1** `staff_authority_options` reference (Abhishek Awate → S H Kopardekar); no unique-constraint collision existed for reassigning that one row (Abhishek Awate had no other authority option). Reassigned it to SUDHANWA KOPARDEKAR's id, verified zero references remained (a `DO $$ ... RAISE EXCEPTION` guard inside the same transaction would have aborted the whole thing if any reference had survived the reassignment), then hard-deleted the "S H Kopardekar" row — all inside one `BEGIN...COMMIT`. **"S H Kopardekar" no longer exists as a row; don't recreate it.** Verified live: `staff_authority_options` now correctly shows Abhishek Awate → SUDHANWA KOPARDEKAR, and a real test Cash submission through that staff member's authority correctly printed "SUDHANWA KOPARDEKAR" as Recommended By.

**Fix 2 — Cash Voucher gets its own numbering series, independent of the main serial number.** Previously the Cash Voucher PDF printed the same `serial_no` as the Payment Advice PDF (e.g. `MCCIA/2026-27/0029`) — no separate series. Now Cash-mode submissions additionally get `CASH/MCCIA/<FY>/NNNN`.
- Schema (migration `0008_cash_voucher_series.sql`, `drizzle-kit generate`d then hand-corrected for statement order — the auto-generated file added the composite PK constraint *before* the `series` column existed and needed the constraint name filled in manually):
  - `payment_advices.cash_voucher_no` — new nullable `text` column. `serial_no` is completely unchanged and still gets allocated for **every** submission regardless of mode — it stays the DB/audit-log/Excel identifier, exactly as before. Do not repoint any of those readers at `cash_voucher_no`.
  - `serial_counters` gains a `series` column (`'PAYMENT_ADVICE'` default, or `'CASH_VOUCHER'`) and its primary key changed from `(financial_year)` alone to `(financial_year, series)` — one row per (FY, series) pair, not a second table. Chose this over a parallel table because it's the same shape (one gapless counter row) with one more discriminator column, and reuses the exact same `SELECT ... FOR UPDATE` transactional pattern with zero new locking logic.
  - Migration also **backfilled the 2 pre-existing real CASH submissions** (`MCCIA/2026-27/0012`, `MCCIA/2026-27/0033`, both still `SUBMITTED`, predating this feature) with `CASH/MCCIA/2026-27/0001` and `.../0002` respectively, in `submitted_at` order, via a `DO $$` block in the same migration — so no historical Cash submission is left with a null Cash Voucher number.
- `lib/serial.ts`: `allocateNumber()` is now the shared gapless primitive (locks by `(financial_year, series)` instead of `financial_year` alone); `allocateSerialNumber()` (unchanged signature/behavior) and the new `allocateCashVoucherNumber()` both call it. **One allocation mechanism serving two series, not two mechanisms** — per the brief's explicit instruction.
- `/api/submit`: both numbers allocated in the **same transaction** — `allocateCashVoucherNumber()` is called (only when `payment_mode === 'CASH'`) inside the same `db.transaction()` callback as `allocateSerialNumber()`, using the just-allocated `financialYear` so both numbers always land in the same FY.
- `/api/edit/[token]` (resubmit): handles the edge case of a resubmission **changing** payment mode. If it flips to CASH and never had a `cash_voucher_no` (was NEFT before, or predates this feature), one is allocated now, same mechanism, using the advice's existing `financial_year` (not recalculated). If it flips away from CASH, `cash_voucher_no` is cleared to null. Not explicitly asked for in the brief, but the form schema does allow changing `paymentMode` on resubmit, so this was needed to keep the column meaningful in that case.
- `CashVoucherDocument.tsx`'s `data.serialNo` prop renamed to `data.cashVoucherNo` — the "No." field on the printed PDF now shows the Cash Voucher number, not the main serial. `cashVoucherPdfFilename()` similarly now takes the Cash Voucher number. Admin detail page (`app/admin/advice/[id]/page.tsx`) gained two new labeled rows, shown only for Cash-mode submissions: "Advice No." (`serial_no`) and "Cash Voucher No." (`cash_voucher_no`) — both visible together so Admin can see both numbers at once.
- **Deliberately not added to the Excel export** (`serial_no` stays the only identifier column there), per the brief's explicit instruction — flagging as a question for the human rather than adding it: **should `cash_voucher_no` be a new Excel column for Cash rows?** Mirrors the already-declined "Expenditure Breakdown" column open item.
- New tests in `lib/serial.test.ts`: pure `formatCashVoucherNo()` formatting, plus 4 new `TEST_DATABASE_URL`-gated integration tests (skipped in this environment — `TEST_DATABASE_URL` is present but empty, same as every prior session) covering: first Cash Voucher number of a new FY, the Cash Voucher series staying independent of the main series advancing within the same FY, the 31 Mar → 1 Apr FY boundary resetting the Cash Voucher series independently, and that calling `allocateSerialNumber()` alone (what happens for a NEFT submission) never creates or touches a `CASH_VOUCHER` counter row.
- **Verified live** against the real dev server + real Neon DB: submitted a real Cash-mode advice through the actual `/api/submit` endpoint (not a direct DB write) — got `serial_no = MCCIA/2026-27/0034` and `cash_voucher_no = CASH/MCCIA/2026-27/0003` (continuing correctly after the 2 backfilled rows), confirmed both independently in `serial_counters` (`PAYMENT_ADVICE` at 34, `CASH_VOUCHER` at 3) and by downloading and reading the actual rendered Cash Voucher PDF — it prints `CASH/MCCIA/2026-27/0003` in the "No." field. Test row + Blob attachments deleted afterward.

**Fix 3 — Admin tab bar restyled from underline to boxed/pill.** Purely cosmetic, per the brief — no filter/gating logic touched. `TabLink` in `app/admin/page.tsx`: every tab (active and inactive) now renders as `rounded-md border px-4 py-2`, matching the visual weight of the existing "Export to Excel"/"New Vendor" buttons. Active: `border-[#0b1f3a] bg-[#0b1f3a] text-white` (filled navy). Inactive: `border-gray-300 bg-white text-gray-600`, with `hover:border-[#0b1f3a] hover:text-[#0b1f3a]`. Removed the container's `border-b border-gray-200` (the underline-strip styling is gone, replaced by the pills themselves). Count badges (`" (N)"`) untouched. **Verified via the real rendered admin HTML** (authenticated session, direct fetch — no browser automation tool exists in this environment): confirmed the active tab's class string includes `bg-[#0b1f3a] text-white` and an inactive tab's includes `border-gray-300 bg-white text-gray-600`, both exactly as intended. Not visually screenshotted — flagging per this repo's established convention for anything needing an actual browser.

`tsc --noEmit`, ESLint, the full Vitest suite (134 passing, 6 pre-existing skipped — 4 more than before, from the new Cash Voucher series integration tests, which stay skipped since `TEST_DATABASE_URL` is empty in this environment), and `next build` all clean after all three fixes.

### Shipped — Real per-person logins, retired Sanction, Payment Done flow, digital PDF stamps (Claude Code, 2026-08-01)
Large brief (`Dual_Login_Retire_Sanction_Stamps_Prompt.md`, kept in the repo root — not deleted, it's the source-of-truth for the decisions below). One blocking confirmation required before starting Part C and obtained from the human before any code was written: **dual-write `payment_done_at`/`payment_done_by` into the legacy `approved_at`/`approved_by_name` fields, same as Sanction used to** — confirmed after grepping every real reader of those two fields (exactly 2: Excel's "Approved On"/"Approved By" columns, and the Payment Advice PDF's "Approved on :" line) and reporting that back before the human said yes.

**Part A — Real per-person Admin logins, replacing the shared `ADMIN_PASSWORD`:**
- New table `admin_users` (migration `0009_admin_users_and_payment_done.sql`, `drizzle-kit generate`d cleanly this time — no hand-editing needed): `id`, `full_name`, `email` (unique), `password_hash` (bcrypt), `role` (`'PAYMENT_ADVICE' | 'CASH_VOUCHER' | 'ALL'`, plain `text` like every other enum-by-convention column in this schema, not a DB enum), `is_active`, `created_at`, `last_login_at`. Same migration also adds `payment_advices.payment_done_at`/`payment_done_by` (Part C).
- Added `bcryptjs` (pure-JS, no native bindings — deliberately not `bcrypt`, to avoid any Vercel serverless native-module bundling risk).
- **Split `lib/auth.ts` into three files, preserving the file's own documented Edge/Node boundary** (it's imported by `proxy.ts`, which runs on the Edge runtime, and must stay free of Node-only APIs):
  - `lib/auth.ts` (unchanged boundary, Edge-safe): now signs/verifies a JWT carrying `{adminUserId, fullName, adminRole}` instead of the old `{role: "admin"}` marker. `decodeAdminSessionToken()` validates the payload shape strictly, so a token signed under the old shared-password format is treated as no session — a clean cutover, not a hybrid compatibility path. `verifyAdminPassword()` deleted entirely, per the brief's explicit "remove the old shared-password env var and its check path entirely — don't leave it as a fallback."
  - `lib/admin-users.ts` (new, Node-only): `hashPassword`/`verifyPassword` (bcryptjs), `findActiveAdminUserByEmail`, `recordAdminLogin`.
  - `lib/admin-session.ts` (new, Node-only): `getAdminSession()` — reads the cookie via `next/headers` and decodes it via `lib/auth.ts`'s Edge-safe decoder. Used by every Server Component/Route Handler that needs to know who's logged in (the admin list page, the detail page, the layout, the Verify/Payment-Done routes).
- `POST /api/admin/login` now takes `{email, password}`. Timing-safe against email enumeration: runs `bcrypt.compare()` against a fixed dummy hash even when no user matches the email, so a nonexistent-email response takes the same shape of time as a wrong-password one; both return the identical generic `"Incorrect email or password."` message. Records `last_login_at` on success. Existing per-IP rate limiting (5 attempts/15min, best-effort/per-instance) kept unchanged.
- `app/admin/login/page.tsx`: email + password fields (was password-only).
- `app/admin/layout.tsx`: shows `"{fullName} · {role label}"` next to Log Out when a session exists — as a side effect, this also fixes a small pre-existing bug where the nav bar (with a pointless "Log out" button) rendered on the login page itself, since it's now conditional on a real session existing.
- **Access model — deliberately NOT strict siloing, exactly per the human's explicit decision**: `app/admin/page.tsx` defaults the `paymentMode` filter based on the logged-in user's role (`PAYMENT_ADVICE` → `NEFT`, `CASH_VOUCHER` → `CASH`, `ALL` → no default) **only when the URL never mentioned `paymentMode` at all** (a fresh landing) — an explicit `paymentMode=""` ("All" selected) is left alone and never re-defaulted. This is the load-bearing distinction that makes it a *default*, not a wall: `sp.paymentMode === undefined` (key absent) vs `=== ""` (present, explicitly cleared) are different signals from `URLSearchParams`, and the existing `<select name="paymentMode">` always submits the field (even empty), so this falls out naturally with no new tracking state. **No backend query-level blocking was added anywhere** — any signed-in user can still view/filter to everything.
- **`ALL`-role summary dashboard**: `app/admin/page.tsx` renders 6 small cards (count + ₹ total, linking to that tab) above the queue table, only when `session.adminRole === "ALL"`. Reuses the exact same 6 per-tab count queries that already power the tab badges (extended to also `sum()`, not just `count()`) rather than firing a second set of queries — the dashboard and the tab badges can never silently disagree with each other. **One deliberate deviation from the brief's literal wording**: the brief's Part A lists 7 dashboard stages including both "Verified" and "Ready for Payment" as if separate; Part C (written later in the same brief) makes clear these are the exact same derived condition (`verified_at` set). Built 6 cards matching Part D's final, authoritative tab list instead of duplicating one number under two labels — flagging this interpretation here rather than silently picking one.
- `scripts/seed-admin-users.ts` (`npm run seed:admin-users`) — **NOT run this session.** Seeds exactly 3 accounts: Sunil (`PAYMENT_ADVICE`) and Abha (`CASH_VOUCHER`), full names pre-filled from the existing `VERIFIER_NAMES` list ("Sunil Salunke"/"Abha Khatavkar" — almost certainly the same real people the brief refers to by first name only) but **emails left as `TODO-...` placeholders that make the script refuse to run until edited** — the human said they'd supply these separately. The `ALL`-role account's email was pre-filled as `mcciaexplore@gmail.com` (the address already visible in this session's own context) — **the human should confirm this is correct before running the script, not just trust it was inferred correctly.** Generates a cryptographically random password per account (`crypto.randomBytes(20).toString("base64url")`), prints each once to the console and to `scripts/admin-users-report.md` (gitignored, never committed) — only the bcrypt hash reaches the DB. Re-running is safe (errors on the unique-email constraint) but won't silently reset an existing password.

**Part B — Verify auto-attributes to the logged-in user, old 4-person picker's correction UI removed for Verify:**
- `POST /api/admin/advice/[id]/verify` no longer reads `verifiedBy` from the request body at all — `getAdminSession()` supplies it server-side from `session.fullName`. `verifySchema` (the old body-validation schema) deleted as now-genuinely-dead code (I introduced its deadness, so cleaning it up is in-scope, unlike other pre-existing dead code noticed but left alone this session — see below). `VERIFIER_NAMES`/`verifierNameSchema` **kept**, since `PATCH .../verify` (the correction route) still imports them — the comment above them in `lib/validation/payment-advice.ts` now explains why they're not dead, and flags that a real per-person name (e.g. the `ALL`-role account's) is no longer guaranteed to be one of these 4.
- `components/admin/AdviceActions.tsx`: the `VERIFIER_NAMES` `<select>` is gone — the box now just says "Will be recorded as verified by {current user's name}." and a single "Confirm Verification" button, `POST`s with no body.
- `app/admin/advice/[id]/page.tsx`: the "Verified By" row lost its `NameCorrectionAction` — now a plain `Row` like "Received & In Process". **Not removed**: the `PATCH .../verify` route itself, and its `VERIFIER_NAME_CORRECTED` audit_log history — both are inert (unreachable from any UI now) but untouched, since "remove that correction UI" (the brief's exact words) is narrower than "delete the mechanism and its history."

**Part C — Sanction retired; Ready for Payment (automatic) → Payment Done (manual, new terminal action):**
- **`sanctioned_at`/`sanctioned_by` columns, and the Sanctioner "Correct name" PATCH route, are untouched** — per the brief's explicit "keep, don't delete." `POST/PATCH /api/admin/advice/[id]/sanction` still exist as working code, just unreachable from any UI going forward (no button anywhere calls `POST` anymore). `SANCTIONER_NAMES`/`sanctionSchema`/`sanctionerNameCorrectionSchema` all kept for the same reason.
- New columns `payment_advices.payment_done_at`/`payment_done_by` (plain `text` snapshot, same non-FK pattern as `verified_by`/`sanctioned_by` — not a new admin_users FK).
- "Ready for Payment" is **not a new column** — it's the derived condition `verified_at IS NOT NULL AND payment_done_at IS NULL`, shown automatically the instant Verify happens, no separate click, matching this repo's established "derive from timestamps, no new status enum value" convention used everywhere else in the pipeline.
- New route `POST /api/admin/advice/[id]/payment-done`: 401 if not signed in, 404/409/409/400 in the same shape as the old Sanction route (not found / not yet verified / already done / bill-passed-for missing-or-invalid), `payment_done_by` auto-attributed from session (no picker, mirrors Verify), dual-writes `status='APPROVED'`, `approved_at`, `approved_by_name` (the human-confirmed judgment call from the top of this entry). Writes `PAYMENT_DONE` to `audit_log`. **Requires "Bill passed for Rs." to already be saved, same as Sanction used to enforce** — this wasn't explicitly mentioned in the brief (which focused on retiring the *picker*, not this adjacent validation), but silently dropping a real "never finalize without a passed amount" business rule seemed like a bigger, unrequested behavior change than carrying it forward; flagging this judgment call explicitly rather than deciding silently.
- **Not backend-role-gated** — per the same "default filter, not an authorization wall" decision as Part A's landing filter, `payment-done` only requires *some* valid session, not a specific `role`. `AdviceActions.tsx` shows the "Mark Payment Done" button only when the current user's role owns that submission's payment mode (`PAYMENT_ADVICE`↔NEFT, `CASH_VOUCHER`↔CASH) or is `ALL`; anyone else sees an explanatory note instead of the button, but a direct API call from any signed-in session still succeeds (verified live — see below).
- New email `notifyPaymentDone()` (`lib/email/notify.ts` + `lib/email/templates.ts`'s `renderPaymentDoneEmail()`) — subject `"Payment Advice {serial_no} — Payment Done"`, fires once, only from the new route. `renderVerifiedEmail()`'s body copy updated from "forwarded for sanctioning and payment processing" (stale — Sanction no longer exists) to "It is now Ready for Payment."
- `AdviceActions.tsx`'s terminal (`status === "APPROVED"`) branch now reads `paymentDoneAt`/`paymentDoneBy` first, falling back to `sanctionedAt`/`sanctionedBy` for any pre-cutover row that was approved the old way (both are never set by the same action, so this fallback is unambiguous, not a guess). `app/admin/advice/[id]/page.tsx`'s Finance Pipeline section gained a "Payment Done" row (Pending / "Ready for Payment" / "{name} · {date}") and relabeled the old "Sanctioned By" row **"Sanctioned By (historical)"**, now only rendered at all when a row already has `sanctioned_at` set — so it naturally disappears from every new submission going forward without deleting anything for old ones.

**Part D — Tabs updated, all other tab logic unchanged:**
- `lib/admin/filters.ts`: `ADMIN_TABS` renamed `verified_awaiting_sanction` → `verified_ready_payment` (condition changed from "`sanctioned_at` null" to "`payment_done_at` null" — same shape, new column) and `sanctioned_ready` → `payment_done` (still keyed on `status = 'APPROVED'`, unchanged condition, just renamed since there's no more "sanctioned" concept feeding it). The other 5 tabs (`waiting_authority`, `awaiting_finance`, `received_in_process`, `sent_back`, `all`) are byte-for-byte unchanged.
- `app/admin/page.tsx`: `TabLink` labels updated to "Verified — Ready for Payment" and "Payment Done"; boxed/pill styling (shipped in the previous session) kept as-is.

**Part E — Digital stamps on both PDF types:**
- New `lib/pdf/Stamp.tsx`: a small `@react-pdf/renderer` component — bordered rounded box, `rotate(-6deg)`, solid brand color per type (navy=Submitted, green=Approved, amber=Verified — darkened to `#B8790C` from the UI's `#E8A33D` for print legibility against white), name + date **inside** the box (per the spec, not as separate cell text). Positioned `absolute`, `bottom/right: 3` inside a `position: relative` signature cell — first tried `top-right` and it visually collided with the existing name/label text (verified by actually rendering and reading the PDF, not just eyeballing the JSX); bottom-right against the blank "Signature :" line reads far cleaner, confirmed by re-rendering.
- `PaymentAdviceDocument.tsx`: stamps in Submitted (always, once submitted), Recommended by (once `authority_approved_at` set), Verified by (once `verified_at` set) footer cells. **Sanctioned by is never stamped, no exceptions** — confirmed by testing all three progression stages (submitted-only / +approved / +verified) and reading each rendered PDF; the Sanctioned box stayed completely blank at every stage, including once the advice was fully Payment-Done/APPROVED. `footerCell`'s `minHeight` increased 62→80 to give the stamp breathing room. Data type gained `authorityApprovedAt`/`verifiedAt` (ISO timestamps, previously only `verifiedBy`/derived-from-elsewhere existed).
- `CashVoucherDocument.tsx`: same Submitted/Recommended stamps (no Verified box exists on this document — it only ever had Submitted/Recommended/Sanctioned/Payee's Signature). Data type gained `submittedAt`/`authorityApprovedAt`. `signature` cell `minHeight` increased 77→90.
- `lib/pdf/render.tsx` and both sample-render scripts (`scripts/render-test-pdf.tsx`, `scripts/render-cash-voucher-pdf.tsx`) updated to pass the new fields through.
- **Verified by actually rendering and reading real PDFs at each stage, per the brief's explicit ask**, not just inspecting JSX: a hand-built 3-stage test (submitted-only → +approved → +verified) confirmed stamps appear/disappear exactly on schedule with no bleed into cells whose condition isn't met yet. Also confirmed on a fully real, live-submitted-and-processed advice (see the live verification below) — real names, real dates, all three stamps present, Sanctioned box still blank even at the fully-paid/APPROVED terminal state.

**New/updated tests:** `lib/advice/finance-verify-route.test.ts` (POST describe block rewritten — no more body-based name/enum tests, since that validation no longer exists on POST; added a 401-when-signed-out test and a test confirming attribution isn't constrained to the old 4-name list); `lib/advice/finance-payment-done-route.test.ts` (new, 11 tests, mirrors the old sanction-route test shape); `lib/admin-login-route.test.ts` (new, 5 tests — wrong email, wrong password, identical error message for both so the response doesn't leak which was wrong, non-string input, and the full success path including the `last_login_at` call and cookie); `lib/admin/filters.test.ts` (tab rename); `lib/email/templates.test.ts`/`lib/email/notify.test.ts` (new copy, new `notifyPaymentDone` coverage).

**Verified live**, against the real dev server + real Neon DB, using 3 **throwaway** `admin_users` test rows (`test-payment-advice@example.test` etc., deleted after — the real `seed:admin-users` script was never run, per the brief): logged in as each of the 3 roles via the real `/api/admin/login` endpoint and confirmed via the rendered HTML that `paymentMode` defaults to NEFT/CASH/unfiltered respectively, and that the `ALL` account's dashboard cards render with correct counts+sums. Ran one real submission through the entire pipeline via the actual routes (not direct DB writes): submit → authority-approve → receive → **verify with zero request body**, confirmed `verified_by` landed as the real logged-in user's name, not a picked one → confirmed `Mark Payment Done` correctly 400s with no `billPassedFor` saved, then succeeds after saving one → **deliberately called `payment-done` as the wrong-role (`CASH_VOUCHER`) test user against a NEFT advice and confirmed it still succeeds** (200, not 403) — proving the "default filter, not a wall" model is real, not just UI-cosmetic → confirmed via SQL that `status`/`approved_at`/`approved_by_name` all dual-wrote correctly → confirmed the row correctly disappeared from the `verified_ready_payment` tab and appeared in `payment_done` → downloaded the real Payment Advice PDF and confirmed all 3 stamps (Submitted/Approved/Verified) render with the real names/dates and the Sanctioned box stayed blank → confirmed the admin detail page shows no "Correct name" button anywhere (Verify's is gone; no historical Sanction data exists on this new row) and the Payment Done row/terminal box both show the right name+date → **confirmed all 4 live notification emails actually sent via real Resend API calls with real message IDs** (submission confirmation, authority approval, verified, and the brand-new payment-done email), redirected correctly via the still-active `EMAIL_TEST_OVERRIDE_RECIPIENT`. All test data (1 advice + 2 attachments + 3 admin_users rows) deleted afterward.

`tsc --noEmit`, ESLint, and the full Vitest suite all clean (151 passing, 6 pre-existing skipped) — see the session log entry below for exact counts. `next build` re-run clean after this session's changes.

### Shipped — Cash Voucher display/labeling consistency across every surface (Claude Code, 2026-08-01)
The Cash Voucher numbering series (shipped in an earlier session) only fixed the printed PDF's own "No." field — every other surface still said "Payment Advice" and showed `serial_no` regardless of mode. This session's brief was explicit: audit every surface individually, report "already correct" vs "fixed," don't assume. Rule applied everywhere: CASH → "Cash Payment Voucher" language + `cash_voucher_no` as the primary number (internal `serial_no` still visible, small, labeled "Internal Ref." — never primary); NEFT → completely unchanged.

**New shared utility, `lib/advice/document-identity.ts`** (`documentLabelFor()`, `displayNoFor()`) — single source of truth so every surface derives this the same way instead of each hardcoding its own "Payment Advice"/`serial_no" independently, which is exactly the class of bug this session fixes. Reused by every server-rendered page and every email call site below. Unit-tested (`document-identity.test.ts`, 5 tests).

**Per-surface audit result — every one individually checked, per the brief's explicit instruction not to assume:**
- 🔧 **Public confirmation screen (`/submitted/[serial]`)** — FIXED. Heading ("Cash Voucher submitted"), big number (`cash_voucher_no`), the authority-share sentence, the "what happens next" note, and the no-sessionStorage fallback text were all previously hardcoded to "Payment Advice"/serial. `SubmissionSummary` (sessionStorage handoff type) gained a `cashVoucherNo` field, threaded through from `/api/submit`'s (now also `/api/edit/[token]`'s) JSON response, which previously didn't return `cashVoucherNo` at all. The "Download" button's mode branching was **already correct** (untouched).
- 🔧 **Admin queue list (`/admin`)** — FIXED. The list query didn't select `cash_voucher_no` at all; the column always showed `serial_no`. Now shows `cash_voucher_no` for Cash rows via `displayNoFor()`. Column header renamed "Serial No." → "Reference No." (per the brief's own suggested wording, since it now holds either kind of number depending on the row). Did not add a new mode badge/icon — the existing "Mode" column (NEFT/CASH plain text) already gives Admin a scan-at-a-glance signal per row; judged a second visual indicator unnecessary. Flagging this "no new badge" call explicitly since the brief left it to my judgment.
- 🔧 **Admin detail page (`/admin/advice/[id]`)** — FIXED. Eyebrow label and the big `<h1>` were hardcoded to "Payment Advice"/`serial_no`. Now: eyebrow = `documentLabelFor()`, `<h1>` = `displayNoFor()`, plus a small "Internal Ref.: {serial_no}" line underneath for Cash rows only. **Removed** the now-redundant "Advice No."/"Cash Voucher No." row-pair from the page's "Header" section (added in the earlier Cash Voucher session) — with both numbers now shown at the top of the page, repeating them again lower down was redundant, not an improvement; this is a small cleanup directly motivated by this fix, not scope creep.
- 🔧 **All 5 notification emails** (submission confirmation, sent-back, authority-approval, verified, payment-done) — **all 5 needed fixing, none were already correct.** Every template's subject line and body hardcoded "Payment Advice" and/or `{{serial_no}}`; `verify`/`payment-done`'s `documentLabel` derivation was already correct (added in the sessions that built those routes) but the *number* shown alongside it was still always `serial_no`. Added `documentLabel`/`displayNo` fields to `AuthorityApprovalEmailData`/`SentBackEmailData`/`SubmissionConfirmationEmailData` (the 2 that already had `documentLabel` — `VerifiedEmailData`/`PaymentDoneEmailData` — just needed `serialNo` renamed to `displayNo` and their subject lines fixed to stop hardcoding "Payment Advice"). All 8 call sites across 6 route files (`submit`, `edit/[token]`, `send-back`, `authority-approval/[token]/reject`, `verify`, `payment-done`) updated to compute both via the new shared helper; 4 of those 6 routes' DB `select()`s didn't include `cash_voucher_no`/`payment_mode` at all and needed both added.
  - **Reverses a previous, deliberate decision, flagged explicitly rather than silently overwritten**: an earlier session's test asserted the Verified email's subject must be the *literal* string `"Payment Advice {serial}"` even for Cash, "per the exact specified copy" of that session's brief. This session's brief explicitly names "verified" among the emails that must say "Cash Payment Voucher" + `cash_voucher_no` for Cash submissions — a direct contradiction. Proceeded with the new instruction (more recent, more specific, explicitly names this exact email), updated the test, and am flagging the reversal here rather than assuming either brief silently wins.
  - Also fixed: `send-back` route's "An approved Payment Advice cannot be sent back" 409 message now uses `documentLabelFor()`.
- 🔧 **Authority-approval page (`/authority-approval/[token]`)** — FIXED. Eyebrow (`{{serial_no}} · Submitted by...`), `<h1>` ("Payment Advice Approval Request"), and the intro sentence ("this payment advice") were all hardcoded. Now mode-aware via the shared helper; Cash rows show `cash_voucher_no` primary with `(Internal Ref. {serial_no})` inline. The `AuthorityApprovalView` component itself (rendered below the header) was **already correct** — fully generic, driven entirely by props, no hardcoded document-type text anywhere in it.
- 🔧 **Edit/resubmit page (`/edit/[token]`)** — FIXED. Same pattern: eyebrow number and `<h1>` ("Correct and Resubmit Payment Advice") were hardcoded. Now mode-aware.
- 🟢 **PDF download filename** — **already correct**, no fix needed. `cashVoucherPdfFilename()` (built in the earlier Cash Voucher numbering session) already takes `cash_voucher_no` with a `serial_no` fallback; both the admin and public cash-voucher-pdf routes already pass `advice.cashVoucherNo`. Confirmed live: a real download's `Content-Disposition` header read `Cash-Voucher-CASH-MCCIA-2026-27-0005.pdf`.
- 🟢 **`AdviceActions.tsx`'s own PDF preview/download buttons** — **already correct**, no fix needed (checked, not assumed): both the pre-approval and post-approval branches already correctly branch on `paymentMode` and say "Cash Payment Voucher"/route to the cash-voucher-pdf endpoint for Cash. Only the terminal-state text line above those buttons ("Sanctioned by"/now "Payment Done —") is mode-agnostic prose, which is fine since it doesn't reference a document type by name.
- 🟢 **`lib/pdf/PaymentAdviceDocument.tsx`'s own internal "Payment Advice" heading text** — **already correct, not touched.** This document is NEFT-exclusive (Cash never gets this PDF at all, a separate pre-existing, explicitly protected rule — see §5) so hardcoding "Payment Advice" inside it is always true, not a bug.
- 🟢 **Excel export sheet name (`"Payment Advices"`)** — **not touched, per the brief's explicit "what NOT to change."** The workbook covers both NEFT and Cash rows in one sheet; the brief explicitly said the Excel export stays keyed on `serial_no` and out of scope for this session.

**4 more surfaces found with the exact same inconsistency, NOT in the brief's list — flagged per its explicit "ask me, don't fix silently" instruction, left unfixed pending the human's answer:**
1. `lib/advice/authority-token.ts`'s `authorityActionError()` — "This Payment Advice has already been approved."/"...already been sent back to the submitter." Shown to the Recommending Authority on an already-actioned link (via both the authority-approval page's banner and the reject route's 409).
2. `app/api/admin/advice/[id]/route.ts` (the `PATCH` route behind "Bill passed for Rs." save) — "This Payment Advice is already approved and can no longer be edited." 409, surfaced verbatim in `AdviceActions.tsx`'s error text.
3. The **invalid/expired-link** generic error messages on both `/authority-approval/[token]` (`!advice` branch — token matches no row at all, so the mode genuinely isn't knowable) and `/edit/[token]` ("...for help with this Payment Advice.") — lower priority than 1–2 since the wording is generic/edge-case, and in the `!advice` case there may be no mode to even branch on.
4. `components/form/PaymentAdviceForm.tsx`'s submit button ("Submit Payment Advice"/"Resubmit") and the confirmation screen's "Submit another Payment Advice" link — the intake **form** itself, which the brief's listed surfaces start *after* (the confirmation screen, not the form). Arguably fine as-is since the form handles both modes and the button doesn't describe a specific already-submitted document, but flagging since it's the same words appearing regardless of the payment mode selected in the form.

**Verified live** against the real dev server + real Neon DB with a real Cash submission run through the actual public/admin routes end-to-end (not direct DB writes): submit → got `cashVoucherNo` back in the JSON response for the first time → authority-approve → receive → verify → saved Bill Passed For → Mark Payment Done. At each step, confirmed via the real rendered HTML (admin queue, admin detail in both the in-progress and terminal states, the authority-approval page) that the eyebrow/heading said "Cash Payment Voucher" and the primary number was `CASH/MCCIA/2026-27/0005` with `MCCIA/2026-27/0037` only ever appearing as the small "Internal Ref." — never as the primary. Reconstructed all 4 fired emails' exact subject/body (live mode doesn't log full HTML, same technique as prior email-verification sessions — re-rendering the pure template functions with the exact data each route used) and confirmed every one said "Cash Payment Voucher" + `CASH/MCCIA/2026-27/0005`, never the bare serial. Confirmed the downloaded Cash Voucher PDF's filename uses the Cash Voucher number. All test data (1 advice, 2 attachments) deleted afterward.

Also fixed a stale row in §7's field-mapping table below ("No. | No. | kept — reuses Payment Advice `serial_no`") — struck through and annotated, since it described the pre-numbering-series behavior an earlier session already superseded but never updated that table for.

`tsc --noEmit`, ESLint, and the full Vitest suite all clean — see the session log entry below for exact counts.

### Investigated (no code change) — "Missing" CASH/MCCIA/2026-27/0003 in the admin queue (Claude Code, 2026-08-01)
The human noticed the admin queue's Cash Voucher numbers jumped 0001, 0002, 0004 — 0003 nowhere to be seen — and asked for definitive proof of the cause, not an assumption, plus proof the two numbering series are genuinely independent (not restated from design intent).

**Conclusion: (a) expected, not a bug.** `CASH/MCCIA/2026-27/0003` was allocated to a real submission created via the actual `/api/submit` endpoint during this exact engagement's own "Kopardekar merge / Cash Voucher numbering series" session, then deleted as documented test cleanup — see that session's own "Shipped" entry above: *"submitted a real Cash-mode advice through the actual `/api/submit` endpoint... got `cash_voucher_no = CASH/MCCIA/2026-27/0003`... Test row + Blob attachments deleted afterward."* This is a direct, dated, first-party record, not an inference.

**Full reconciliation, all 5 numbers accounted for — queried the real dev DB directly, not assumed:**
| Number | What it was | Current status |
|---|---|---|
| 0001 | Real pre-existing production row (payee "KHAANE PE", `serial_no MCCIA/2026-27/0012`) | Still exists |
| 0002 | Real pre-existing production row (payee "KHAANE PE", `serial_no MCCIA/2026-27/0033`) | Still exists |
| 0003 | Real test submission, this session's own "Cash Voucher numbering series" work | Deleted as documented cleanup |
| 0004 | **Real live production row** (payee "AMAZON .IN", `serial_no MCCIA/2026-27/0036`, submitted 2026-08-01 13:50:56) — genuine MCCIA usage between two of this engagement's test sessions, not test data | Still exists |
| 0005 | Real test submission, this session's own "Cash Voucher display/labeling" work | Deleted as documented cleanup |

`serial_counters` currently reads `CASH_VOUCHER` at `last_number = 5` — matching exactly, confirming nothing was allocated and left unaccounted for beyond what's explained above.

**Checked for a soft-delete concept, per the ask — none exists.** Grepped `lib/db/schema.ts` for `deletedAt`/`is_deleted`/equivalent: zero matches, on any table. Every deletion in this codebase's history (including every test-cleanup step across every prior session) is a genuine hard `DELETE`, confirmed by `payment_advices` currently holding exactly the rows expected (3 real rows: the two "KHAANE PE" and the one "AMAZON .IN") with no orphaned/tombstoned rows anywhere.

**`audit_log` cross-check**: zero rows currently reference `CASH/MCCIA/2026-27/0003` or `.../0005` in their `details`. This is expected, not a dead end — this engagement's established test-cleanup practice (used in every prior session) always deletes the `audit_log` rows tied to a deleted test `payment_advices` row in the same cleanup transaction, so an absence of `audit_log` traces is consistent with documented, deliberate cleanup, not evidence of anything else.

**Main `serial_no` series has far larger gaps, from the identical pattern — confirms this is normal, existing, engagement-wide behavior, not something specific or new to the Cash Voucher series.** Only 3 `payment_advices` rows exist in the entire database right now (`MCCIA/2026-27/0012`, `0033`, `0036`), while `serial_counters`'s `PAYMENT_ADVICE` counter is at `37` — i.e., roughly 34 numbers were issued and never persist as visible rows today. This isn't a mystery either: dozens of real test submissions were created via the real `/api/submit`/`/api/edit` endpoints and deleted as cleanup across essentially every prior session in this engagement (Approval Workflow, Finance Pipeline, multiple live-email-verification rounds, Task A, Sent Back/Name Correction, the Cash Voucher sessions, the dual-login session, etc.) — each one permanently consumed a `serial_no` that was never going to be reused, by the same gapless-never-reused design the Cash Voucher series now shares.

**Part 2 — proved the two series are independent by reading the actual code and schema, not restating intent:**
- **Real DB structure** (`psql \d serial_counters`): `PRIMARY KEY (financial_year, series)` — a genuine composite key enforced by Postgres itself. `PAYMENT_ADVICE` and `CASH_VOUCHER` are always different rows; there is no shared row either series could contend for.
- **`lib/serial.ts`'s `allocateNumber(tx, financialYear, series)`** is the one shared primitive both series call — but every one of its three statements (`insert ... on conflict`, `select ... for update`, `update`) is scoped by `where financial_year = ? and series = ?`. The `SELECT ... FOR UPDATE` row lock is taken on exactly one row; locking/incrementing the `CASH_VOUCHER` row for a given FY can never block or touch the `PAYMENT_ADVICE` row for that same FY, and vice versa.
- **`allocateSerialNumber()`** hardcodes `PAYMENT_ADVICE_SERIES`; **`allocateCashVoucherNumber()`** hardcodes `CASH_VOUCHER_SERIES` — neither is ever called with the other's series value; there is no parameterization that could cross them.
- **The call site** (`app/api/submit/route.ts`, inside the single `db.transaction()` that does both allocations): `allocateCashVoucherNumber()` is invoked only inside `values.paymentMode === "CASH" ? await allocateCashVoucherNumber(...) : null` — for a NEFT submission, that function is **never called at all**, meaning the `CASH_VOUCHER` counter row isn't even read, let alone incremented, for a NEFT submission. This is the literal code proof that a NEFT submission never touches the Cash Voucher counter — not an inference from naming.

**One transparency note, not a bug and not what caused this gap**: number allocation (`allocateSerialNumber`/`allocateCashVoucherNumber`) happens in its own `db.transaction()`, committed immediately; the actual `payment_advices` row insert happens in a *separate*, later `db.transaction()`, with the Blob attachment upload (not itself transactional) in between. Structurally, this means a failure between those two points (e.g. a Blob upload error, a server crash) **could** in principle leave a number allocated with no row ever created — a real gap-source, but it is the exact same pattern `serial_no` allocation has always used, unchanged and pre-existing (not introduced by the Cash Voucher work), and it is not what produced the 0003/0005 gaps investigated here (those are explained fully by documented, deliberate test-then-delete). Restructuring this into one fully atomic allocate+insert+upload transaction would be a real, bigger architectural change — not done here, not asked for; flagging for awareness only.

**No code change made** — Part 1 concluded (a), so per the brief's own instruction, no fix and no new test were needed. `document-identity.test.ts`/`serial.test.ts`'s existing coverage (FY-boundary independence, "NEFT never allocates a Cash Voucher number") already exercises the atomicity/independence properties directly relevant here.

### Shipped — Live email switched to Gmail SMTP, Resend kept dormant-but-ready (Claude Code, 2026-08-05)
Resend requires `mcciapune.com` to be DNS-verified before it can email anyone but the account owner — see the many open items above tracking that. That verification is taking longer than there's time for, so this session switches the *live* provider to Gmail SMTP (via a Google App Password on `mcciaexplore@gmail.com`), which works immediately with no DNS wait. Accepted trade-off, explicit and deliberate, not an oversight: live mail now shows as coming from a Gmail address, not an official MCCIA domain, until `mcciapune.com` is verified and someone flips `EMAIL_PROVIDER` back to `resend`.

- Added `nodemailer` (+ `@types/nodemailer`) — the standard library for this, nothing more exotic.
- **All of the provider-agnostic logic in `lib/email/notify.ts` is completely unchanged**: `isLiveMode()`, the `EMAIL_TEST_OVERRIDE_RECIPIENT` redirect + subject-prefix logic, the no-email-authority graceful preview fallback (`notifyAuthorityApproval`), and the "never throw to the caller" contract are all byte-for-byte the same code as before this session. Only the actual "hand this email to a provider" call changed.
- **New provider abstraction, deliberately small** (per the brief's explicit "one function that picks which transport to use," not a big refactor): `getProvider()` reads `EMAIL_PROVIDER` (`"resend"` → Resend; anything else, including unset → `"gmail"`, the new default) and a single `dispatch(from, to, subject, html)` function branches on it. `dispatch()` normalizes both providers to the same "resolves with an id, or throws" shape — Resend's SDK returns `{error}` instead of throwing for API-level failures, so that case is converted into a thrown `Error` right there, meaning `send()`'s one surrounding `try/catch` still needs zero provider-specific branching and didn't need to change shape.
- **Resend's code path is fully intact, not deleted**: `getResendClient()` (lazy-constructed, same pattern as before) is untouched; `dispatch()` calls it exactly as `send()` used to, just now behind the `getProvider() === "gmail"` check. Switching back later is `EMAIL_PROVIDER=resend` plus a real `RESEND_API_KEY` — no rebuilding.
- **`getFrom()` now branches by provider**: for `gmail` (default), it's always `GMAIL_USER` — Gmail SMTP requires the authenticated account and the `from` header to match, so `EMAIL_FROM` is simply not consulted in that branch (confirmed live and in a unit test — setting `EMAIL_FROM` while on the gmail provider has zero effect). For `resend`, `getFrom()` is the exact prior logic (`EMAIL_FROM || "onboarding@resend.dev"`), unchanged.
- **Gmail transport** (`getGmailTransport()`): lazily constructed and cached at module scope, same reasoning as `getResendClient()` always used — importing `notify.ts` never requires `GMAIL_USER`/`GMAIL_APP_PASSWORD` to be set, only actually sending live via gmail does. Uses nodemailer's built-in `service: "gmail"` config exactly as specified, authenticated with `GMAIL_USER`/`GMAIL_APP_PASSWORD` (a Google App Password, not the account's real login password — requires 2-Step Verification to generate one).
- Env vars: `EMAIL_PROVIDER` (new, `gmail`/`resend`, defaults `gmail`), `GMAIL_USER`/`GMAIL_APP_PASSWORD` (new, only required for the gmail provider) — documented in `.env.local.example` and README's env var table. `RESEND_API_KEY`/`EMAIL_FROM` stay documented too, now explicitly scoped "only used when `EMAIL_PROVIDER=resend`." `EMAIL_TEST_OVERRIDE_RECIPIENT`/`EMAIL_MODE` docs unchanged — they apply identically to both providers.
- **Incidental fix while touching these same two files**: `.env.local.example` and README still referenced the retired shared `ADMIN_PASSWORD` (dead since the real per-person `admin_users` login shipped) and README's deploy steps still pointed at the old standalone `/admin/authorities` page (replaced by inline management on `/admin/staff` in that same earlier session). Both corrected — small, directly adjacent, not a separate unrelated cleanup pass.
- **Tests**: `lib/email/notify.test.ts` restructured into three describe blocks — preview mode (unchanged), "live mode, Gmail SMTP (the default provider)" (mocks `nodemailer.createTransport`, re-covers every scenario the old Resend-only suite covered: correct recipient/subject/HTML, override redirect, no-email fallback, SMTP send failures caught without throwing), and "live mode, `EMAIL_PROVIDER=resend` (dormant-but-ready)" (mocks the `Resend` class, proves that path still genuinely works end-to-end, not just left in place unverified). One gotcha hit and documented in a test comment: the Gmail transport is a lazy module-scope singleton (same caching pattern `getResendClient()` always used), so a test asserting `createTransport`'s exact call args has to run before any earlier test in the same describe block has already triggered — and cached — that construction; ordered accordingly.
- **Verified live** against the real dev server + real Neon DB + real Gmail SMTP (not mocked) — restarted the dev server first so the new env vars were actually read. Ran 3 real submissions through the actual public/admin routes to exercise every one of the 5 emails once each: submission confirmation + authority-approval (submission 1) → sent-back, via a real authority rejection (submission 1) → submission confirmation + authority-approval + verified + payment-done (submission 2, full pipeline: approve → receive → verify → save Bill Passed For → Mark Payment Done) → submission confirmation + graceful no-email fallback for authority "DG" (submission 3). All 6 live sends (submission confirmation ×2, authority approval ×2, sent-back ×1, verified ×1, payment-done ×1 — 7 total email attempts, 6 real sends + 1 correctly-not-sent fallback) succeeded with real Gmail message IDs in the server log (format `<...@gmail.com>`, visibly different from Resend's UUID-style IDs — direct evidence these went through Gmail's SMTP servers, not Resend). No auth-related failures, no "suspicious sign-in" block from Google on this App Password's first live sends. `GMAIL_USER` confirmed set to `mcciaexplore@gmail.com`; since `getFrom()` for gmail unconditionally returns `GMAIL_USER` with no override path (confirmed by reading the code, not assumed), all 6 sends used that as `from` — same no-inbox-access limitation as every prior email-verification session in this engagement, so this is proven from the code path rather than an inbox screenshot, consistent with how "from" was verified for Resend previously. Re-tested the no-email-authority fallback (authority "DG") specifically: server log shows the identical `"No email on file for authority DG, falling back to preview."` warning + full preview HTML dump, zero Gmail transport calls for that specific send — the fallback logic genuinely didn't change, proven, not just restated. All 3 test submissions + 6 attachments deleted afterward.

`tsc --noEmit`, ESLint, and the full Vitest suite all clean — see the session log entry below for exact counts.

### Shipped — Provider-level email failures now surface in the Audit Trail, not just server logs (Claude Code, 2026-08-05)
Prompted by the human clicking a stale authority-approval link and asking, separately, whether a *real* send failure (as opposed to the benign "no email on file" case) would actually be noticed — it wouldn't have been, beyond a `console.error` only visible in Vercel's function logs. This closes that gap without changing anything about the "no email on file" path, which was already correct as designed (`notifyAuthorityApproval`'s `!to` branch — console.warn + preview, never reaches `send()` at all, never writes an audit row).

- `send()` in `lib/email/notify.ts` now takes an optional `adviceId` param. On a provider failure (SMTP auth error, network error, Resend API error — anything caught by the existing `try/catch` around `dispatch()`), it still `console.error`s as before, and additionally — if `adviceId` was given — writes `{ action: "EMAIL_SEND_FAILED", actor: "System", details: { kind, provider, error } }` to `audit_log`. That write is itself wrapped in a try/catch (best-effort, never throws) — a DB hiccup while logging a failure must not become a second unhandled failure.
- All 5 `notify*` exported functions (`notifySubmissionConfirmation`, `notifyAuthorityApproval`, `notifySentBack`, `notifyVerified`, `notifyPaymentDone`) gained the same optional `adviceId` param, threaded through to `send()`. All 7 call sites across `app/api/submit`, `app/api/edit/[token]`, `app/api/authority-approval/[token]/reject`, `app/api/admin/advice/[id]/verify`, `app/api/admin/advice/[id]/payment-done`, `app/api/admin/advice/[id]/send-back` now pass the advice's real id — it was already in scope at every one of those call sites, no new query needed anywhere.
- No new UI — the existing "Audit Trail" section on `/admin/advice/[id]` (`app/admin/advice/[id]/page.tsx`) already renders every `audit_log` row generically (action/actor/timestamp/IP), so `EMAIL_SEND_FAILED` just shows up there like any other event. Considered a dedicated banner component too; the existing Audit Trail already satisfies "surface it somewhere Admin can see" with zero new UI code, so that's what shipped.
- **Verified live against the real dev DB and real Gmail SMTP** (not mocked): temporarily forced a wrong `GMAIL_APP_PASSWORD` (via a throwaway script's own `process.env` override — the real `.env.local` was never touched) and called `notifySubmissionConfirmation` with a real existing advice's id (`MCCIA/2026-27/0041`). Got a real Google `535-5.7.8 Username and Password not accepted` SMTP rejection, and confirmed the exact `EMAIL_SEND_FAILED` row landed in `audit_log` with that real error message in `details`. Test row deleted afterward (this was a real, unrelated advice — only the one throwaway audit row was removed, not the advice itself).
- Tests: `lib/email/notify.test.ts` gained a `db.insert` mock plus 5 new cases (writes on failure with an adviceId; does not write without one; does not write on success; a failure to write the audit row itself is swallowed and logged, never thrown; the no-email-on-file fallback never writes one either). 5 pre-existing `notifyVerified`/`notifyPaymentDone`/`notifySentBack` call-site assertions in `finance-verify-route.test.ts`, `finance-payment-done-route.test.ts`, and `authority-reject-route.test.ts` updated for the new third argument. Full suite: 174 passed, 6 skipped (unrelated, pre-existing `TEST_DATABASE_URL`-gated integration tests). `tsc --noEmit` and ESLint both clean.

### Shipped — Closed a real security gap: identity confirmation before Recommending Authority Approve/Send Back (Claude Code, 2026-08-06)
**The risk, precisely:** `/authority-approval/[token]`'s only protection was the token itself — unguessable, but its sole distribution channel was one email to the named authority. If that email was ever forwarded, or an inbox shared/compromised, **anyone holding the link could approve or reject a real payment** — no check ever confirmed the person clicking was actually the named authority. This had been true since the Approval Workflow shipped (2026-07-30) and was never flagged as a gap until now.

**The fix — lightweight identity confirmation, explicitly not a login system, exactly as scoped:**
- The submission details section (payee, amount, attachments, etc.) renders completely unchanged, always visible. Only the Approve/Send Back button row is gated — replaced by a single "Confirm your email to continue" field until the visitor types the email on file for **this advice's specific authority** (not a global `admin_users`/`staff_members` lookup — scoped via `advice.recommendingAuthorityId`, per the brief).
- New route `POST /api/authority-approval/[token]/confirm-identity` (`app/api/authority-approval/[token]/confirm-identity/route.ts`). Reuses `authorityActionError()` so an already-approved/rejected/expired link 409s the same way approve/reject already do — nothing to confirm identity for on a dead link.
- **Match logic**: `emailsMatch()` (`lib/advice/authority-identity.ts`) — trim + lowercase compare, same normalization convention `lib/admin-users.ts` already uses for admin login. A wrong email returns a deliberately generic 401 — `"That email doesn't match our records for this approval."` — never reveals the real email or any other identifying detail, per the brief's explicit anti-probing requirement (verified: the correct email never appears anywhere in a failure response body).
- **Rate limiting — DB-backed, not an in-memory map.** Unlike `app/api/admin/login/route.ts`'s per-instance `Map` limiter (which the comment there already admits doesn't hold up across Vercel serverless cold starts), this counts recent `AUTHORITY_IDENTITY_CHECK_FAILED` `audit_log` rows for the advice (`createdAt >= now - 15min`) before evaluating each attempt. 5 wrong attempts within the rolling window → the 6th request of any kind (including one with the *correct* email) gets `429` — a genuine lockout, not just "wrong guesses keep failing." Self-cleaning: once the oldest of the 5 ages past 15 minutes, the count drops and access resumes with no separate lockout-expiry field needed. Scoped per-token (per-advice), exactly as asked — not per-IP.
- **Every wrong attempt writes a distinct `AUTHORITY_IDENTITY_CHECK_FAILED` audit_log row** (`actor: "Unverified visitor"`, `details: {attemptedEmail}`, real IP) — a rate-limited (6th+) attempt does *not* get its own row, since it never reaches the comparison step. A correct confirmation does **not** write any audit row (not asked for; only failures needed to be traceable per the brief).
- **Session persistence**: on success, sets a per-token `HttpOnly`/`Secure`/`SameSite=lax` cookie (`mccia_authority_identity_{token}`, deliberately no `Max-Age`/`Expires` — a true browser-session cookie, cleared on browser close, matching "remember it for that browser session" literally). One cookie per token, not a single shared one, so an authority with more than one pending approval isn't forced to re-confirm on a second link just because they confirmed on a first. `app/authority-approval/[token]/page.tsx` reads it server-side via `cookies()` and passes `identityConfirmed` down; `AuthorityApprovalView` shows the button row directly when true, the email-confirm form otherwise.
- **Real edge case found and resolved before writing any code, not silently defaulted:** `recommending_authorities.email` is nullable, and exactly one active, currently-used authority — **"DG"** — had no email on file, which would have permanently locked that authority out of ever confirming identity. Asked the human directly rather than guessing fail-open-vs-fail-closed; **the human provided DG's real email (`dg@mcciapune.com`), which was set directly in the real DB**, resolving the edge case outright. The route still fails closed defensively (`503`, generic message, does *not* count as a rate-limited attempt) for any future authority ever added without an email, so the gap can't silently reopen.
- **Explicitly not touched, per the brief**: `/edit/[token]` (the submitter's resubmit link) — no identity gate added there; token TTL/generation mechanism/delivery unchanged; no login system introduced.
- New files: `lib/advice/authority-identity.ts` (`emailsMatch`, `identityCookieName`, rate-limit constants), `lib/advice/authority-identity.test.ts` (5 tests), `lib/advice/authority-confirm-identity-route.test.ts` (8 tests: 404 bad token, 409 already-actioned, 409 expired, 429 after 5 failures with the email check never even reached, 400 malformed email, 503 + not-counted-as-an-attempt when the authority has no email, 401 + generic error + correctly-shaped audit row on a wrong email, 200 + cookie set on a case/whitespace-insensitive match). New Zod schema `authorityIdentityConfirmSchema` in `lib/validation/payment-advice.ts`.
- **Verified live against the real dev server + real Neon DB** (not just mocked tests): inserted two real test advices routed to DG. On the first — 5 wrong-email attempts in a row, each a real `401` with the generic message, each writing its own real `AUTHORITY_IDENTITY_CHECK_FAILED` audit_log row (confirmed via direct query: 5 rows, correct `attemptedEmail`/IP each) — then a 6th attempt **using DG's actual correct email** still got `429`, proving the lockout blocks everyone, not just continued guessing. On the second — confirmed the raw page HTML shows only the "Continue" button (no `>Approve<`/`>Send Back<` anywhere) before confirming; a wrong email first, then `"  DG@MCCIAPUNE.com  "` (mixed case, whitespace) correctly matched and returned `200` with a real `Set-Cookie: mccia_authority_identity_{token}=1; Path=/; Secure; HttpOnly; SameSite=lax` header (no `Max-Age`/`Expires` — genuinely a session cookie, confirmed by inspecting the raw header); reloading the same page with that exact cookie attached then rendered `>Approve<`/`>Send Back<` directly, no re-prompt. Both test advices and all 6 audit rows deleted afterward. `tsc --noEmit`, ESLint, the full Vitest suite (187 passed, 6 pre-existing skipped), and `next build` all clean.

### Shipped — Removed the obsolete paper-form code `MCCIA/ACTT/PAD/013` (Claude Code, 2026-08-06)
That code was the old physical paper form's printed identifier (from the form this app replaced, `MCCIA/ACTT/PAD/013`) — no longer meaningful once the app got its own numbering (`MCCIA/<FY>/NNNN` and `CASH/MCCIA/<FY>/NNNN`). Removed everywhere it still appeared in the live app, per-surface audit below (not assumed — every surface individually checked, plus an exhaustive case-insensitive regex grep for `ACTT` and `PAD[ /_-]*013` across every file in the repo, confirming exactly these occurrences and no others, including checking `public/mccia-logo.png` isn't carrying it baked into pixels — it isn't, just the wordmark).

**Per-surface findings:**
- 🔧 **Public submission form header** (`app/page.tsx`) — was there, small eyebrow text above the "Payment Advice" H1. Removed the line entirely; no layout fix needed, the H1 simply becomes the first line in that stacked block, reads completely naturally.
- 🔧 **Payment Advice PDF header** (`lib/pdf/PaymentAdviceDocument.tsx`) — was there, top-right of the header row (`styles.headerFormNo`, a fixed 92pt-wide right-aligned text), flanking the centered institutional title against the logo on the left. Text removed, but the **92pt-wide element itself was kept as an invisible spacer** (`styles.headerRightSpacer`) rather than deleted outright — the centered title (`headerCenter`, `flex: 1`) is centered *between* the logo and this element, so deleting the element too would have visibly shifted the title left, off its original balance. Rendered and visually inspected (`npx tsx scripts/render-test-pdf.tsx`) — header reads clean, centered, no visible gap or hint anything was removed.
- ✅ **Cash Voucher PDF** (`lib/pdf/CashVoucherDocument.tsx`) — verified, not assumed: its masthead was never a 3-part layout like the Payment Advice PDF's — it's just `[logo][centered heading, flex: 1]`, two parts, no third right-side element ever existed here. Genuinely never carried this code. Re-rendered (`npm run pdf:test:cash-voucher`) and visually confirmed unaffected.
- ✅ **Admin detail page, authority-approval page, edit/resubmit page, all 5 email templates** (`lib/email/templates.ts`) — zero occurrences in any of them, confirmed by the exhaustive grep, not by spot-checking pages alone.
- ✅ **Every other source file** (constants, config, other components/templates) — zero occurrences.
- **Found in 3 documentation files, deliberately left untouched, flagging per the "ask me if found somewhere unexpected" instruction**: `README.md`, `SPEC.md`, and this file's own §1 Project Overview all reference `MCCIA/ACTT/PAD/013` as **historical/background prose** — describing what the old paper form used to be called, past tense, while explaining why this app exists. That's accurate documentation of history, not a live surface showing stale branding to a real user, and the brief's own acceptance criteria scoped the "zero occurrences" grep to "components, PDF templates, email templates, constants files" specifically. Did not touch these three — say the word if you'd like them reworded too.
- **Live-tested**: fresh Payment Advice PDF and Cash Voucher PDF rendered and visually inspected (screenshots taken via `qlmanage` thumbnailing, cropped to the header region) — both clean. Public form loaded from the real dev server (`curl http://localhost:3000/`) — confirmed zero occurrences in the rendered HTML and the header markup has no leftover empty tags. `tsc --noEmit`, ESLint, the full Vitest suite (187 passed, 6 pre-existing skipped — this was a text/layout-only change, no new tests needed), and `next build` all clean.

### Shipped — Fixed "Your Name"/"Your Email" vertical misalignment (structural, not a margin hack) + a real stale-auto-fill bug (Claude Code, 2026-08-06)
Two related public-form fixes to Section 1 "Submitter details." **No browser automation tool was available in this environment for any prior session's work** (documented repeatedly throughout this file) — both of these needed real rendering/interaction to verify honestly, so this session installed Playwright + a headless Chromium build as a **temporary devDependency**, used it to drive the actual page, then fully uninstalled it and cleaned the browser cache afterward (`git diff package.json package-lock.json` confirms zero trace left behind). Human explicitly approved this before it happened.

**Issue 1 — alignment.** `components/ui/Field.tsx`'s helper-text `<p>` was conditionally rendered (`{help ? <p>...</p> : null}`) — "Your Name" has help copy, "Your Email" doesn't, so in the two-column grid "Your Name"'s input started lower than "Your Email"'s. **Checked git history first, per instruction, rather than assuming**: `git log --all -- components/ui/Field.tsx` shows exactly **one commit total — the initial build (`a782956`)**. This was never fixed and never regressed; it simply never landed, full stop.
- **Fix is structural, in the shared component, not a one-off margin hack**: the helper-text `<p>` is now *always* rendered (same element, every field, whether or not `help` is passed), falling back to a non-breaking-space placeholder and `invisible` (not `display:none`) when there's no real help text — so a real line box is always reserved at a fixed height. This fixes every current and future two-column field pairing in the app that mixes fields with/without helper text, not just this one spot — and won't drift again if the copy changes, since there's no hardcoded pixel margin anywhere to get out of sync.
- **Verified with real pixel measurements, not "looks close”**: Playwright `boundingBox()` on both inputs. Before: name input top `353px`, email input top `331px` (**22px off**). After: both **exactly `353px`, 0px difference**. Screenshot of the rendered section attached to this session's work confirms it reads as a normal, intentional layout — no visible gap where the old conditional text used to not be.

**Issue 2 — email auto-fill.** The brief's premise was that this auto-fill was *never wired up at all*. **Checked before assuming, per instruction**: `resolveAutoFillEmail()` / `handleStaffMatch()` / `onMatch` wiring **already existed**, already committed to `main` (commit `36b6291`), and read as correct on paper. Live Playwright testing (after discovering `/api/staff/search` genuinely takes 0.5–1.9s round-trip in this dev environment — Neon connection overhead, not a bug, but enough to make a naive short test-wait look like a false failure) found the **real** bug: switching the Name field to a *different* matched staff member never updated or cleared a previously auto-filled email — `resolveAutoFillEmail`'s old "never overwrite a non-empty field" guard couldn't tell a *stale auto-fill* apart from a *real manual edit*, so once anything had been auto-filled once, it was permanently stuck.
- **Fix**: `lib/form/staff-email-autofill.ts`'s `resolveAutoFillEmail()` now takes a third argument — `lastAutoFilledEmail`, whatever it itself last wrote into the field (or `null`) — and returns a `{type: "fill"|"clear"|"none"}` action instead of a bare string. A field holding exactly what was last auto-filled is a safe-to-replace stale value; anything else (a real manual edit, or an `/edit/[token]` resubmit prefill) is left alone, full stop, even across a match change.
- `PaymentAdviceForm.tsx`'s `handleStaffMatch()` now mirrors `RecommendingAuthorityField`'s existing `lastStaffId` ref pattern exactly (`lastMatchedStaffIdRef` — only acts on an actual identity change, not every redundant `onMatch` call) plus a new `lastAutoFilledEmailRef` tracking what it last wrote, per the design above.
- **Verified live via Playwright against the real dev server + real Neon DB**, using real staff rows found by direct query: "Ganesh Mate" (has `ganeshm@mcciapune.com` on file), "Ziya Ahmad" (active, no email on file), "Abhishek Awate" (has an email, used to prove the *update-to-a-new-person's-email* path, not just clear-to-empty), and a nonexistent name. All 6 acceptance-criteria scenarios confirmed: fills on a match with an email; leaves blank with no error on a match with none; **updates to the new person's email when switching between two matches that both have one**; **clears when switching to a match with none, or to no match at all** (both previously stuck on the stale value — now fixed); a manual edit survives further unrelated keystrokes in the Name field untouched.
- Tests: `lib/form/staff-email-autofill.test.ts` rewritten for the new 3-arg/action-returning signature, 10 cases (up from 5) covering every scenario above at the pure-logic level.
- `tsc --noEmit`, ESLint, the full Vitest suite (192 passed, 6 pre-existing skipped), and `next build` all clean. Playwright fully uninstalled afterward — not a permanent addition to this repo's toolchain; see the note above.

### Shipped — Site icons (originally 2026-08-05, retroactively documented) + restyled white/rounded (Claude Code, 2026-08-06)
**Retroactive note first, since this was never actually logged here despite shipping in an earlier session** — a real process gap, flagged plainly rather than quietly patched over: `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png`, `public/manifest.json`, and a regenerated `app/favicon.ico` were all added 2026-08-05, wired into `app/layout.tsx`'s `metadata.icons`/`manifest` and a new `viewport.themeColor`, plus a distinct `title` per section (`app/layout.tsx` → "MCCIA Payment Advice", `app/admin/layout.tsx` → "MCCIA Finance Admin" via `title.absolute` so it doesn't inherit the root's title template). None of that wiring changed in this session — this was a pure asset regeneration, per the brief's explicit scope.

**This session's change — restyled from navy hard-edged square to white rounded square:**
- All 4 icon files regenerated from the same source (`public/mccia-logo.png`, trimmed to its real content bbox first — the source PNG has transparent padding around the actual wordmark). White background (`#ffffff`, not the navy `#0B1F3A` used originally), rounded-square shape at ~21% corner radius (matches the brief's "20-22%, ~40px/192px, ~110px/512px" convention), logo centered with the same ~14-16% margin as before so it doesn't touch the rounded edges or corners.
- **"Rounded square" means real transparency, not a white shape drawn on a white square** (which would be invisible) — `icon-192.png`/`icon-512.png`/`favicon.ico` are `RGBA` with the four corners at `alpha=0` outside a white rounded-rect drawn via `ImageDraw.rounded_rectangle`. Confirmed by reading a corner pixel directly (`(0,0)` alpha `0`) and by compositing onto a dark background to make the transparent rounding visually obvious — a plain white-on-white render would have hidden this.
- **`apple-touch-icon.png` is deliberately the one exception — plain, fully opaque `RGB` (no alpha channel at all), hard-edged square, no pre-baked rounding.** This is Apple's own long-standing documented convention: iOS applies its own corner mask (and historically gloss/shadow effects) to home-screen icons, so shipping a pre-rounded or transparent source produces double-rounding/corner artifacts once iOS's mask is applied on top. Confirmed this is still correct practice before shipping it this way, per the brief's explicit instruction not to just assume.
- `favicon.ico` got the same rounded treatment as the two PNG icons, at all 3 embedded sizes (16/32/48px) — rounding is visible at every size; the logo's own legibility at 16px is still poor (a blur, not readable as "mccia") **regardless of background/shape, exactly as flagged in the original icon session — not a new problem, not something fixable without a separate icon-only mark being designed.**
- `public/manifest.json` needed zero content changes — filenames are unchanged, already correct; only re-confirmed it still points to the right files after regeneration.
- **Confirmed nothing else changed**: `git diff` on `app/layout.tsx`/`app/admin/layout.tsx`/`public/manifest.json` is empty — this really was an asset-only change, per the brief's explicit acceptance criterion.
- **Live-verified**: every generated PNG actually opened and visually inspected (not just trusted from the generation code) — `icon-512.png`/`icon-192.png` composited onto a dark background to confirm the rounded transparency is real and correctly shaped; `apple-touch-icon.png` confirmed `RGB` mode with a genuinely opaque white corner pixel; all 3 favicon sizes rendered and inspected. Dev server re-checked afterward: both `/` and `/admin/login`'s rendered `<head>` still show identical icon/manifest/theme-color links to before, and `/icon-512.png`, `/apple-touch-icon.png`, `/favicon.ico`, `/manifest.json` all still serve `200 OK` with the new content. `tsc --noEmit` and ESLint clean (no code touched, so no test/build re-run was substantively needed beyond that sanity check).

### Shipped — Basic/GST amount split + multi-part payment tracking, NEFT only (Claude Code, 2026-08-17)
**Scope, per the human's explicit instruction: NEFT (Payment Advice) only.** Cash Voucher's single line-item Total and its existing "Mark Payment Done" (`POST /api/admin/advice/[id]/payment-done`) are **completely unchanged** — verified explicitly, not assumed (see the live-test section below). This retires the old single-action "Payment Done" flow for NEFT (data preserved, not deleted) in favor of a new multi-part payment model, driven by a real-world problem: Finance sometimes pays the Basic Amount now and the GST portion weeks later once recovered via GST return, or splits a large payment across two dates for other reasons — the app now records payments as they actually happen instead of forcing one lump-sum action.

**Part 1 — Basic Amount + GST Amount split, replacing the single "Amount (Rs.)" field for NEFT:**
- Migration `0010_typical_albert_cleary.sql` (drizzle-kit-generated cleanly, no hand-editing needed — purely additive): `payment_advices.basic_amount`/`gst_amount` (both nullable `numeric(14,2)`) and `payment_advices.total_paid` (`numeric(14,2)`, `default '0'`, `not null`).
- **Deliberately added new columns rather than repurposing the pre-existing "Phase 2" placeholder columns** (`taxable_value`, `cgst_amount`/`sgst_amount`/`igst_amount`/`igst_rcm_amount`) that already sat unused in the schema and look like they were meant for something like this — flagged to the human before building, who confirmed new `basic_amount`/`gst_amount` columns over reusing/repurposing the placeholders. Those Phase 2 columns remain completely untouched, still available if that work ever happens.
- `amount` (the DB column) is unchanged in meaning: still the Total, still what the PDF/Excel/`bill_passed_for <=` check/every other existing reader uses. For NEFT it's now auto-calculated client-side as `basicAmount + gstAmount` (same `useEffect`-computes-into-a-hidden-field pattern the Cash Voucher line-item total already used) and re-validated server-side in `paymentAdviceFormSchema`'s `superRefine` (paise-safe rounding, same technique as the existing Cash-total check).
- Public form, Section 3 "Bill & reference," NEFT only: "Amount (Rs.)" replaced by three fields — **"Basic Amount (Rs.) (*Subject to TDS)"** (required), **"GST Amount (Rs.)"** (required, `min="0"`, helper text "Enter 0 if GST is not applicable" via `Field`'s existing `help` prop), and a read-only **"Total (Rs.)"** that updates live as either amount changes.
- `basicAmount`/`gstAmount` are `undefined`/optional at the Zod object-shape level (Cash never submits either) but required-for-NEFT specifically inside `superRefine` — `gstAmount` can legitimately be `0`, so it's checked with `=== undefined`, not a truthy check, same pattern the rest of this schema already uses for mode-specific required fields (`bankAccountNo`, etc.).
- **Backward compatibility, not backfilled**: old NEFT rows only have `amount`. Every display surface checks `basicAmount !== null && gstAmount !== null` and falls back to showing just the Total when either is null — never a blank/broken "Basic: — GST: —" line. `/edit/[token]`'s prefill leaves both fields blank for a pre-split row rather than guessing a split; resubmitting such a row requires the submitter to supply real values (the schema requires them for NEFT going forward).
- **Payment Advice PDF** (`lib/pdf/PaymentAdviceDocument.tsx`): the "Amount Rs." cell becomes three lines — "Basic Amount Rs. (*Subject to TDS) :", "GST Amount Rs. :", "Total Rs. :" — when both are non-null; falls back to the original single "Amount Rs. :" line otherwise. Verified by rendering a real PDF via the live test below — see the attached-in-session screenshot equivalent (rendered and read directly, not just inspected in JSX).
- Admin detail page's "Money" section mirrors the same graceful three-line/fallback pattern.
- **Excel export was deliberately NOT touched** — no `basicAmount`/`gstAmount`/`totalPaid`/payment-count columns added, per the same standing "ask before adding Excel columns" rule this repo has followed since the Approval Workflow/Cash Voucher sessions. Confirmed the export needs no changes for *correctness*: it reads `amount` (still the Total, unchanged meaning) and `status`/`approvedOn`/`approvedBy` (still correctly dual-written on full settlement — see Part 2). Flagging here rather than adding silently, in case Finance wants any of these as new columns.

**Part 2 — `payment_entries` table + "Record a Payment," replacing "Mark Payment Done" for NEFT:**
- Same migration as above adds `payment_entries` (`id`, `payment_advice_id` FK cascade-delete, `amount numeric(14,2) not null`, `remarks text not null`, `paid_at timestamptz not null default now()`, `paid_by text not null`, `created_at`). NEFT only in practice — Cash never inserts here.
- New route `POST /api/admin/advice/[id]/payment-entries` (`app/api/admin/advice/[id]/payment-entries/route.ts`). 401 signed-out; 404 not found; 409 if `paymentMode !== "NEFT"` (mirrors the existing "Cash never gets a Payment Advice PDF" 404-for-the-wrong-mode pattern, inverted); 409 if not yet verified; 400 if `bill_passed_for` was never saved; 400 if the requested amount exceeds the remaining balance; `remarks` required (Zod `paymentEntrySchema`).
- **Cap basis, confirmed with the human before building, not assumed**: `bill_passed_for` minus the sum of all prior `payment_entries` for that advice — not the raw Basic+GST Total. Confirmed by reading the code first: `bill_passed_for` already existed as exactly this — the field where Finance confirms the actual payable amount, validated `<= amount`, and previously enforced by the old Payment Done route as its own finalization gate. So this is the same ceiling concept, just checked incrementally instead of once.
- **Race-safety**: the cap check runs inside a `db.transaction` that does a raw `SELECT bill_passed_for, total_paid, status FROM payment_advices WHERE id = $1 FOR UPDATE` (same locking primitive `lib/serial.ts`'s `allocateNumber()` already uses for gapless numbering) before computing the new total — two concurrent "Record a Payment" submits against the same advice can't both pass a stale remaining-balance check and together overpay it. All paise-math done via `Math.round(x * 100)` integer comparison, not floating point.
- `total_paid` is updated atomically in the same transaction as the `payment_entries` insert (cached running total, not a live `SUM()` — same "avoid an aggregate on every render" reasoning as every other cached/derived field in this schema).
- **The entry that brings `total_paid` to (or past) `bill_passed_for` dual-writes `status = 'APPROVED'`, `approved_at` = that entry's `paid_at`, `approved_by_name` = that entry's `paid_by`** — the exact same dual-write the old single Payment Done action performed, so Excel/PDF's "Approved on" line keep working unchanged. Partial entries never touch these three fields. **NEFT never touches `payment_done_at`/`payment_done_by` at all going forward** — those are now effectively Cash-only fields; the new "Fully Payment Settled" terminal UI reads from `payment_entries` + `total_paid` directly instead.
- `paid_by` is auto-attributed from `getAdminSession()`, same no-picker pattern as Verify/the old Payment Done.
- Writes a `PAYMENT_ENTRY_RECORDED` audit_log row per entry (`details: {amount, remarks, totalPaid, billPassedFor, isFinal}`).
- **Two money-safety guards added beyond the literal brief, flagged here rather than silently patched in**, both scoped so Cash rows (which never have `payment_entries`) are completely unaffected:
  1. `PATCH /api/admin/advice/[id]/route.ts` (the "Bill passed for Rs." save route) now 409s once ≥1 `payment_entries` row exists for that advice — the cap Finance's entries were measured against can no longer be changed out from under already-recorded payments. `AdviceActions.tsx` mirrors this: once `totalPaid > 0`, "Bill passed for Rs." renders as locked read-only text instead of an editable input.
  2. `POST /api/admin/advice/[id]/send-back/route.ts` now also 409s once ≥1 `payment_entries` row exists (in addition to the pre-existing "already APPROVED" 409) — NEFT's partial-payment model can leave real money already disbursed while `status` is still `SUBMITTED` (only the *final* entry flips it to `APPROVED`), so sending such an advice back for resubmission would let the submitter change bill details a real disbursement already happened against, with no reconciliation path. Not requested by the brief; added as a judgment call, `AdviceActions.tsx`'s Send Back button is hidden (replaced by an explanatory note) once any entry exists, matching the server guard.

**Part 3 — Admin UI ("Record a Payment"), replacing "Mark Payment Done" for NEFT only:**
- `components/admin/AdviceActions.tsx` now branches by `paymentMode` at exactly the two places that differ — the "Ready for Payment" action block and the terminal (`status === "APPROVED"`) display — with everything else (Bill Passed For editing subject to the new lock, authority box, Receive, Verify, Send Back subject to the new guard) staying one shared code path for both modes, unchanged in behavior for Cash.
- **Cash's branch is byte-for-byte the pre-existing code** — same single "Mark Payment Done" button, same `paymentDoneAt ?? sanctionedAt` terminal fallback display, same Cash Payment Voucher download links.
- **NEFT's new branch**: once Verified, shows a running summary ("Partial Payment Done."/"Ready for Payment." + "Paid so far: ₹X of ₹Y — ₹Z remaining"), the full payment history (date/amount/remarks/who, every past entry — the audit trail), and a "Record a Payment" form (amount + required remarks textarea) gated by the same `ownsSubmissionType()` role check the old Payment Done button used (default filter, not a backend wall — same "any signed-in admin can still call the API directly" model as before). The terminal (fully settled) state shows "Fully Payment Settled — ₹X paid," the same payment history list, and the Download Payment Advice PDF button.
- `app/admin/advice/[id]/page.tsx` now also queries `payment_entries` for the advice and passes `totalPaid`/`paymentEntries` down to `AdviceActions`.

**Part 4 — Emails: one per payment entry, not a cumulative summary:**
- New `renderPaymentEntryEmail()`/`PaymentEntryEmailData` (`lib/email/templates.ts`) and `notifyPaymentEntry()` (`lib/email/notify.ts`) — completely separate from `renderPaymentDoneEmail()`/`notifyPaymentDone()`, which are untouched and still fire exactly as before for Cash's one-shot action.
- Subject/body clearly states **"Partial Payment Recorded"** (with the remaining balance) or **"Payment Complete"** (final), showing that specific entry's own amount and remarks — never a cumulative recap. Two payments on one advice send two separate, independently-accurate emails. Fires from the `payment-entries` route with the real `adviceId`, so a provider-level send failure still writes the existing `EMAIL_SEND_FAILED` audit_log row (2026-08-05 session's mechanism, reused as-is — no changes needed there).

**Part 5 — Tabs, mode-split so Cash's queue experience doesn't change:**
- `lib/admin/filters.ts`'s `ADMIN_TABS` grew from 7 to 9: the old single `payment_done` tab's condition is now scoped `status = 'APPROVED' AND payment_mode = 'CASH'` (Cash's tab, otherwise byte-for-byte the old condition — Cash's queue experience is unchanged); two new tabs, **`partial_payment_done`** (`status = 'SUBMITTED' AND payment_mode = 'NEFT' AND total_paid > 0`) and **`fully_payment_settled`** (`status = 'APPROVED' AND payment_mode = 'NEFT'`), cover NEFT. `verified_ready_payment` gained an `AND total_paid = 0` condition so a NEFT row with a partial payment recorded (still `status = 'SUBMITTED'`, since only the *final* entry flips it) correctly falls out of this tab into `partial_payment_done` instead — a no-op for Cash, which never writes to `total_paid`. **Confirmed via a real Postgres query, not assumed**, that an untyped `'0'`-string bind parameter correctly casts to `numeric(14,2)` for equality/`>` comparisons regardless of stored trailing-zero formatting (`'0.00' = $1` with `$1 = '0'` → `true`).
- `app/admin/page.tsx`: `TabLink` row and the `ALL`-role dashboard cards both updated for the 2 new tabs (dashboard grid `lg:grid-cols-6` → `lg:grid-cols-8`); the old "Payment Done" label is now **"Payment Done (Cash)"** so the split reads clearly to Admin. All 4 other pre-existing tabs (`waiting_authority`/`awaiting_finance`/`received_in_process`/`sent_back`) and `all` are byte-for-byte unchanged.

**Tests**: `lib/db/migrations/payment-entries-migration.test.ts` (schema snapshot), `lib/advice/payment-entries-route.test.ts` (13 tests — every guard, the race-safety row-lock branch, partial vs. final dual-write, audit_log), `lib/advice/bill-passed-for-lock-route.test.ts` (4, the new lock), `lib/advice/send-back-payment-entries-guard.test.ts` (3, the new guard, explicitly including a Cash-mode case proving it's unaffected), `lib/validation/payment-advice.test.ts` (+6, Basic/GST superRefine rules), `lib/admin/filters.test.ts` (+6, the tab-condition split), `lib/email/templates.test.ts`/`lib/email/notify.test.ts` (+4/+3, `renderPaymentEntryEmail`/`notifyPaymentEntry`, partial vs. final subject/copy). One pre-existing test (`lib/advice/edit-resubmit-attachment-collision.test.ts`) needed its NEFT form-data fixture updated to include `basicAmount`/`gstAmount` now that they're required — not a behavior regression, just a fixture that predated this session.

**Verified live**, against the real dev server + real Neon DB + real Gmail SMTP (`EMAIL_MODE=live`, not mocked), via direct API calls exercising the actual routes (no browser automation available in this environment, consistent with every prior session's noted gap): submitted a real NEFT advice (Basic ₹10,000 + GST ₹1,800 = Total ₹11,800) through `/api/submit` → confirmed `basic_amount`/`gst_amount` persisted correctly → authority-approved via the real token flow → Received → Verified → saved `bill_passed_for = 11,800` → **recorded a ₹10,000 partial payment** ("Basic Amount paid now") → response correctly showed `isFinal: false`, `remaining: "1,800.00"` → confirmed the three new guards all fire correctly with a real payment on record: editing `bill_passed_for` → 409 "locked"; Send Back → 409 "payment recorded"; a payment exceeding the ₹1,800 remaining → 400 with the exact remaining amount in the message → confirmed via the real admin queue HTML that the row appeared in `partial_payment_done` and NOT in `verified_ready_payment` or `fully_payment_settled` → **recorded the final ₹1,800 GST payment** → response correctly showed `isFinal: true`, `remaining: "0.00"` → a third payment attempt correctly 409'd "already fully settled" → confirmed via direct DB query: `status = 'APPROVED'`, `approved_at`/`approved_by_name` dual-written to the second entry's `paid_at`/`paid_by`, `total_paid = 11,800.00`, `payment_done_at`/`payment_done_by` **both still null** (NEFT never touches them), both `payment_entries` rows present with correct amount/remarks/paidBy, full `audit_log` trail present (`SUBMITTED` → `AUTHORITY_APPROVED` → `FINANCE_RECEIVED` → `VERIFIED` → 2× `PAYMENT_ENTRY_RECORDED` with correct `isFinal` flags, **zero `EMAIL_SEND_FAILED` rows** — confirming all payment-entry emails sent successfully via real Gmail SMTP, redirected to the account owner's inbox via the pre-existing `EMAIL_TEST_OVERRIDE_RECIPIENT`) → downloaded and visually inspected the real rendered Payment Advice PDF: three-line Basic/GST/Total breakdown correct, `Bill passed for Rs. : 11,800.00`, all three stamps (Submitted/Approved/Verified) present and correctly dated, Sanctioned box still blank → confirmed the admin detail page's rendered HTML shows the Basic/GST/Total lines, "Fully Payment Settled — ₹ 11,800.00 paid," and a "Payment History" section listing both entries with their real remarks/paidBy/timestamps.

**Cash Voucher explicitly verified unaffected, not assumed**: ran a full separate Cash submission through the identical pipeline (submit → authority-approve → Receive → Verify → save Bill Passed For) → confirmed `POST .../payment-entries` correctly 409s "only available for NEFT Payment Advices" for this advice → called the **old, untouched** `POST .../payment-done` route directly → 200, exactly as before → confirmed via direct DB query: `status = 'APPROVED'`, `payment_done_at`/`payment_done_by` set (the Cash-only dual-write path), `total_paid` stayed `'0.00'` (Cash never writes to it), `basic_amount`/`gst_amount` stayed `null` → confirmed via the real admin queue HTML that this row appears **only** in `payment_done` (now labeled "Payment Done (Cash)") and **not** in `fully_payment_settled`, while the NEFT row from the same session appears only in `fully_payment_settled` and not in `payment_done` — no leakage in either direction → downloaded the real Cash Payment Voucher PDF, still renders correctly (200, valid single-page PDF).

All test data (2 advices, 4 attachments + their real Vercel Blob uploads, 1 throwaway `admin_users` login, all associated `payment_entries`/`audit_log` rows) deleted afterward — confirmed 0 rows remaining for both advice IDs post-cleanup, and the 4 blob objects individually listed and deleted via the Blob `list()`/`del()` API (not just the DB rows).

`tsc --noEmit`, ESLint, the full Vitest suite (229 passing, 6 pre-existing skipped), and `next build` all clean.

### Shipped — "← Back" links on every admin sub-page, real browser-history-based (Claude Code, 2026-08-17)
**The problem**: sub-pages in the admin area had no in-page way to return to the list/dashboard view — only the browser's own back button, not discoverable for non-technical users. Pure UX fix, no data-model changes.

- New shared client component `components/admin/BackLink.tsx` (`"use client"`, the same small-component pattern `LogoutButton.tsx` already used) — calls `router.back()` on click, falling back to a supplied `fallbackHref` only when `window.history.length <= 1` (i.e. this page was opened directly, with nothing real to go back to). **Deliberately real browser-history navigation, not a hardcoded `<Link href="/admin">`** — this is what naturally preserves whatever tab/filter/page state the list view was in when Admin drilled into a sub-page, with zero state serialization needed. Rendered as plain text (`← {label}`, no button chrome), consistent placement immediately above the page's `<h1>` on every page it's used.
- **Full audit of every page under `app/admin/`, not assumed** — 9 total `page.tsx` files. `app/admin/page.tsx` (the list itself) and `app/admin/login/page.tsx` (the entry point) need no back link. `app/admin/vendors/page.tsx` and `app/admin/staff/page.tsx` are themselves top-level list views (reached via the persistent header nav's "Vendors"/"Staff & Authorities" links, same as "Submissions") — not sub-pages of a list, so no back link added there either. The remaining 5 are genuine one-level-deep sub-pages and all got the link: `app/admin/advice/[id]/page.tsx` ("← Back to Submissions"), `app/admin/vendors/[id]/page.tsx` and `app/admin/vendors/new/page.tsx` ("← Back to Vendors"), `app/admin/staff/[id]/page.tsx` and `app/admin/staff/new/page.tsx` ("← Back to Staff & Authorities").
- The pre-existing persistent header nav (`app/admin/layout.tsx`'s "Submissions"/"Vendors"/"Staff & Authorities" links) was **not** repurposed for this — those always reset to the default unfiltered view, which is exactly the behavior this task needed to avoid for the advice detail page. `BackLink` is a separate, additional affordance.

**Verified live**, via a **temporary Playwright install** (`npm install --no-save -D playwright`, uninstalled afterward — `git diff package.json package-lock.json` confirmed empty, same "temporary, not a permanent toolchain addition" convention the 2026-08-06 "Your Name"/"Your Email" session established; Chromium binary was already cached from that earlier install) against the real dev server + real Neon DB, using one throwaway `admin_users` login and one throwaway test `payment_advices` row:
- Applied a real filter (typed "BackLinkTestPayee" into the Payee field, submitted the form) on the `all` tab → the resulting URL carried the full filter query string → opened the test row's detail page → clicked "← Back to Submissions" → **landed back on the exact same filtered URL, byte-for-byte** (confirmed via string equality, not just "some filter present") → confirmed the Payee input still showed the applied value.
- Repeated for `?tab=waiting_authority` (no other filters) → same exact-URL-match result after clicking Back — confirming this isn't specific to query-string filters, tab selection survives identically.
- Confirmed the Back link's exact label text on `/admin/advice/[id]`, `/admin/vendors/[id]`, `/admin/vendors/new`, `/admin/staff/[id]`, `/admin/staff/new` (5/5) and that clicking it from `/admin/vendors/new`/`/admin/staff/new` (reached via their real "New Vendor"/"New Staff Member" links) correctly returns to `/admin/vendors`/`/admin/staff`.
- Screenshotted all three page types (advice detail, vendor edit, staff edit) and visually confirmed identical placement/styling — plain gray text, `←` prefix, directly above the `<h1>`, no button chrome.
- All test data (1 `payment_advices` row + its `audit_log` rows, 1 throwaway `admin_users` login) deleted afterward; Playwright fully uninstalled, confirmed via empty `git diff` on `package.json`/`package-lock.json`.

`tsc --noEmit`, ESLint, the full Vitest suite (229 passing, unaffected by this UI-only change), and `next build` all clean.

### Shipped — Payment Advice PDF: "Recommended by" stamp text corrected (Claude Code, 2026-08-17)
Small, isolated wording fix. `lib/pdf/PaymentAdviceDocument.tsx`'s "Recommended by" signature box (rendered once `authority_approved_at` is set) was stamping the word **"APPROVED"**, inconsistent with its own box label — "Submitted by" correctly stamps "SUBMITTED" and "Verified by" correctly stamps "VERIFIED". Changed the `<Stamp label="...">` value for that one box to **"RECOMMENDED"**. Nothing else about that stamp changed — same render condition (`data.authorityApprovedAt` set), same name/date/color. `Stamp.tsx`'s box has a fixed `width: 68`pt with no `nowrap`, so the longer word (11 chars vs. "APPROVED"'s 8) still fits on one line — confirmed by actually rendering and reading the PDF, not assumed from the CSS (per the existing "Do Not Touch" note on `Stamp.tsx` about re-rendering before trusting a layout change).

**Found, not fixed, flagged per this repo's standing "ask/report rather than patch silently" convention**: `lib/pdf/CashVoucherDocument.tsx`'s own "Recommended by" stamp (line ~136) has the **exact same "APPROVED" vs. "Recommended by" mismatch** — this session's brief was explicitly scoped to the Payment Advice PDF only, so the Cash Voucher PDF was left untouched. If the human wants the same correction there, it's the identical one-line change in `CashVoucherDocument.tsx`'s `Signature` stamp prop.

**Verified live**: rendered the sample script (`npx tsx scripts/render-test-pdf.tsx`) and visually confirmed "RECOMMENDED" fits cleanly in the stamp with no overflow/wrapping issue. Also downloaded the real Payment Advice PDF for an actual pre-existing, already-approved production row (`MCCIA/2026-27/0042`, via `GET /api/admin/advice/[id]/pdf` with a throwaway admin login, read-only — no data mutated) and visually confirmed "RECOMMENDED" with the correct name ("Neeraj Thakur") and date, while "SUBMITTED"/"VERIFIED" render unchanged. Throwaway `admin_users` test row deleted afterward. `tsc --noEmit`, ESLint, the full Vitest suite (229 passing, unaffected — no test asserted the old "APPROVED" stamp text), and `next build` all clean.

### Shipped — Advance Payment feature: third Payment Mode option, own numbering series, routes through existing NEFT/Cash pipelines (Claude Code, 2026-08-17)
**The concept, exactly as scoped**: Advance Payment is a third top-level choice on the public form (NEFT / Cash / Advance Payment), not a fourth `payment_mode` DB value. Selecting it reveals a secondary NEFT-or-Cash sub-choice; the submission is stored exactly as a regular NEFT or Cash submission would be (`payment_mode` stays `'NEFT'`/`'CASH'`, same routing to Sunil's/Abha's dashboard), plus a new `is_advance` boolean and its own fields. **Settlement (reconciling actual spend against the advance afterward) is explicitly out of scope — nothing here supports it, no placeholder columns added for it either**, per the brief.

**Schema** (migration `0011_amused_pretty_boy.sql`, drizzle-kit-generated cleanly, no hand-editing — purely additive): `payment_advices.is_advance` (`boolean default false not null`), `advance_no` (nullable text, own series), `purpose_of_advance` (nullable text), `previous_pending_advance_amount`/`previous_pending_advance_since` (nullable). New table `advance_particulars` (mirrors `cash_voucher_items`): `category` (one of 6 presets or `'OTHER'`), `other_description` (only populated for `OTHER`), `amount`, `sort_order`.

**Numbering — third independent series, `lib/serial.ts`'s `allocateAdvanceNumber()`/`formatAdvanceNo()`** (`ADV/MCCIA/<FY>/NNNN`), same gapless `SELECT ... FOR UPDATE` mechanism as the other two series, added as a new `series` value on the existing composite-PK `serial_counters` table (confirmed the composite key shape already accommodates a third value trivially — no schema change needed there, per the Do Not Touch rule's own instruction to check this first). **One shared counter regardless of NEFT/Cash sub-route** — live-verified: a NEFT-advance got `ADV/MCCIA/2026-27/0001`, a Cash-advance submitted right after got `ADV/MCCIA/2026-27/0002` (continuing the same counter, not resetting). Allocated in the same transaction as whichever underlying number also gets allocated (`serial_no` always; `cash_voucher_no` too when Cash-routed) — same dual-numbering precedent as the original Cash Voucher series. On resubmission via `/edit/[token]`, mirrors the exact `cash_voucher_no` pattern: keeps the existing `advance_no` if already allocated, allocates fresh only the first time `isAdvance` flips true, nulls it out if a resubmission flips `isAdvance` back to false.

**`lib/advice/document-identity.ts` extended, not replaced** — two new identities: `documentLabelFor(mode, isAdvance)` returns **"Advance Payment Advice"** (NEFT-routed) / **"Advance Cash Voucher"** (Cash-routed) — note this is **not** a mechanical "Advance " + base-label prefix; "Advance Cash Voucher" deliberately drops "Payment" from the non-advance "Cash Payment Voucher," per the exact naming the brief specified (a test asserting the naive prefix concatenation initially caught this). `displayNoFor(mode, serialNo, cashVoucherNo, isAdvance, advanceNo)` returns `advanceNo` when `isAdvance`, superseding even `cashVoucherNo` for a Cash-routed advance. New `billPassedForLabelFor(isAdvance)` — `"Amount Sanctioned"` vs `"Bill passed for Rs."`, same underlying `bill_passed_for` column, label-only.

**Full per-surface audit of every `documentLabelFor`/`displayNoFor` call site, per the brief's explicit "same rigor as the earlier labeling-consistency task" — 11 found, all fixed, one pre-existing gap found and fixed as a byproduct:**
1. `app/api/submit/route.ts` — allocation + both notify calls.
2. `app/api/edit/[token]/route.ts` — resubmission allocation/nulling + notify call.
3. `app/admin/page.tsx` — queue list's Reference No. column (also added `isAdvance`/`advanceNo` to its `db.select()`).
4. `app/admin/advice/[id]/page.tsx` — header, Money section, Narrative section relabel, new "Advance Details" section, "Payment" section's Mode row (appends " (Advance)"), "Internal Ref." condition extended.
5. `components/admin/AdviceActions.tsx` — new `isAdvance` prop, `billPassedForLabel` computed once and substituted at all 5 places "Bill passed for Rs." appeared (both terminal-state branches, the editable-field label, and both "must be saved before..." hints).
6. `app/api/admin/advice/[id]/verify/route.ts`.
7. `app/api/admin/advice/[id]/payment-done/route.ts` (Cash's route — still reachable for a Cash-Advance) — also its "must be filled" error message now says "Amount Sanctioned" for advances.
8. `app/api/admin/advice/[id]/payment-entries/route.ts` (NEFT's route) — same for its own "must be saved" error.
9. `app/api/admin/advice/[id]/send-back/route.ts` — both the already-approved 409 message and the notify call.
10. `app/api/authority-approval/[token]/reject/route.ts`.
11. `app/authority-approval/[token]/page.tsx` and `app/edit/[token]/page.tsx` — header number/label + "Internal Ref." condition.
12. **Pre-existing gap, not introduced this session, found and fixed as a byproduct**: `app/submitted/[serial]/page.tsx` (the public confirmation screen) never used `document-identity.ts` at all — it hand-rolled its own NEFT/CASH branching inline, predating this file's introduction. Since the brief explicitly named this screen as a surface needing correct `advance_no` display, fixed it in place: the primary number, the "submitted" label prefix, the "Internal Ref." condition, and the authority-share sentence (the one spot whose existing copy already matched `documentLabelFor`'s real output, so it now calls the function directly) — the page's own shortened "Cash Voucher submitted" heading copy (vs. `documentLabelFor`'s fuller "Cash Payment Voucher") was deliberately left as its own distinct wording, not forced to match, since that's a separate pre-existing stylistic choice.
13. **Also fixed**: `pdfFilename()`/`cashVoucherPdfFilename()` in `lib/pdf/render.tsx` now receive the resolved display number (via `displayNoFor()`) from all 4 PDF routes, not the raw `serialNo`/`cashVoucherNo` — an advance's downloaded PDF filename now reads `ADV-MCCIA-2026-27-0001.pdf`, not the internal serial.

**Public form** (`components/form/PaymentAdviceForm.tsx`): Section 4's Mode field is now a genuine 3-way radio (NEFT / Cash / Advance Payment) driving two form fields together (`isAdvance` + `paymentMode`), not a native `register()`-bound radio group — selecting "Advance Payment" reveals a secondary NEFT/Cash sub-radio. Section 3 gained a full Particulars block (category dropdown with the exact 6 paper-form presets + conditional "please specify" text for `OTHER`, add/remove rows, live-summed Total via the same `useEffect`-computes-into-`amount` mechanic Cash Voucher items already use) + "Purpose of Advance" (required textarea) + "Previous Pending Advance" (amount, defaults 0; "Since" date field only rendered/required when amount > 0) — all gated behind `isAdvance`, which also now hides the Basic/GST block (NEFT) and the free-text line items (Cash) and the standalone "Nature of Expenditure" field entirely. Tax Invoice's `required` prop on `FileUploadSlot` is now `!isAdvance`; the client-side attachment check and its error copy are equally conditional. Validation (`lib/validation/payment-advice.ts`) mirrors all of this in a restructured `superRefine` — bank details for NEFT stay required regardless of `isAdvance` (money still needs a destination), everything Basic/GST/cash-items/nature-of-expenditure-specific is now gated behind `!data.isAdvance`, and a parallel `isAdvance` branch requires Purpose of Advance, ≥1 Particulars row (paise-safe sum-matches-`amount` check, same technique as the Cash total check), `otherDescription` when category is `OTHER`, and "Since" only when Previous Pending Advance > 0.

**A deliberate design decision, not explicitly instructed, flagged rather than decided silently**: `purposeOfAdvance` is mirrored into the existing NOT NULL `nature_of_expenditure` column (same dual-representation pattern `cash_voucher_items` already established for Cash) — and on the PDF and admin detail page, the existing "Nature of Expenditure" box/row is **relabeled** to "Purpose of Advance" for an advance rather than shown as a second, separate box, since both would otherwise print/show the identical purpose text twice under two different labels. This directly extends the same "Bill passed for Rs. → Amount Sanctioned" relabel precedent the brief itself established for a different field, applied consistently here too.

**PDF — both `PaymentAdviceDocument.tsx` and `CashVoucherDocument.tsx` extended conditionally (`data.isAdvance`), not a third template, reusing the proven layout/stamps/signature-box code exactly as instructed:**
- Payment Advice PDF: the existing "Nature of Expenditure" cell relabels to "Purpose of Advance :" (see above); "Bill passed for Rs." cell relabels via `billPassedForLabelFor()`; a new bordered Particulars table (Category / Description / Amount / Total row) plus a "Previous Pending Advance : {amount} (since {date})" / "None" line render between the main info table and the footer signature table, only when `isAdvance`. The `basicAmount`/`gstAmount` cell already correctly falls back to a plain "Amount Rs." line for an advance with zero code changes needed there — both are always null for advances, exactly the same fallback path pre-split legacy NEFT rows already exercise (confirmed, not assumed, per the "verify this explicitly" instruction in the brief — see the live-test section below).
- Cash Voucher PDF: its existing single items table is **reused**, not duplicated — for a Cash-advance it's fed from `advance_particulars` (category label, `" — {otherDescription}"` appended for `OTHER`) instead of `cash_voucher_items`, with the column header relabeling "NATURE OF EXPENDITURE" → "PARTICULARS". A new box between the payee box and the items table shows Purpose of Advance + the same Previous-Pending-Advance line. This document never had a "Bill passed for Rs." box to begin with (the paper Cash Voucher form doesn't have that concept), so "Amount Sanctioned" was **not** force-added here — nothing to relabel.
- Both PDF types' primary document-number field (`serialRow`/`metadata.No.`) renamed to `displayNo` in their respective `...PdfData` types and now receives the resolved `displayNoFor()` result from `lib/pdf/render.tsx`, not a raw `serialNo`/`cashVoucherNo` — same rename applied consistently across `render.tsx`, all 4 PDF routes, and the two sample render scripts (`scripts/render-test-pdf.tsx`, `scripts/render-cash-voucher-pdf.tsx`).
- Signature boxes (Submitted by / Recommended by / Verified by / Sanctioned by) and their stamps are **completely untouched** — same logic, same conditions, confirmed by rendering and reading real advance PDFs (see live-test section).

**Confirmed, not assumed, per the brief's explicit "Ask me before proceeding if..." condition**: the Basic/GST split's `bill_passed_for`-based payment-capping logic (`payment-entries`/`payment-done`/the PATCH lock route, all from the prior session's multi-part-payment feature) does **not** reference `basicAmount`/`gstAmount` anywhere — confirmed by an exhaustive grep across the whole codebase before writing any code. Since an advance's `amount` is computed from the Particulars total via the exact same `useEffect`-into-`amount` mechanic Basic+GST and Cash-items already use, the entire payment-recording/capping mechanism works for advances with **zero code changes** — a clean bypass, live-verified end-to-end (see below), not just inferred from reading the code.

**Judgment call, not explicitly instructed, kept per its own merits — flagged since the brief explicitly invited pushback on it**: "Purpose of Advance" was kept as a distinct field from the itemized Particulars breakdown. Particulars categorizes *what* by preset type (e.g. "Conveyance ₹500"); Purpose captures *why* — real context an approver needs that a category label alone doesn't convey, especially since the preset categories are generic. Concluded it earns its place rather than being redundant.

**New surfaces found that could have silently broken with a third mode, all confirmed safe by the underlying design choice** (per the brief's third "ask before proceeding" condition — report findings, not silently patch): none needed patching, because `payment_mode` itself never gained a third value — every pre-existing `paymentMode === "CASH"`/`"NEFT"` branch across the whole codebase (tabs in `lib/admin/filters.ts`, the Payment Mode filter dropdown, `StatusChip`, the two PDF routes' mode-gating 404s, `SubmissionConfirmationEmailData`'s button-gating logic) is untouched and correct by construction — confirmed via live-testing both an advance and a regular submission through the admin tabs (see below), not just reasoned about.

**Excel export deliberately NOT touched** — same standing "ask before adding columns" rule this repo has followed since the Approval Workflow session. `is_advance`/`advance_no`/Particulars aren't exported; flagged as an open item below rather than added silently.

**Tests**: `lib/db/migrations/advance-payment-migration.test.ts` (schema snapshot), `lib/advice/document-identity.test.ts` (+7: the two new identities, the non-prefix "Advance Cash Voucher" wording, `advanceNo` superseding `cashVoucherNo`, `billPassedForLabelFor`), `lib/validation/payment-advice.test.ts` (+13: full advance superRefine coverage — Basic/GST bypass, Particulars total-matching, `OTHER` description requirement, Previous Pending conditional requirement, NEFT bank details still required, Cash-routed advance bypassing `cashVoucherItems`), `lib/serial.test.ts` (+4: `formatAdvanceNo` unit tests + one `skipIf(!testDbUrl)` integration test proving the shared-counter behavior, consistent with this repo's established "unit test what's pure, integration-test what needs a real DB, live-test what needs the real app" convention — the integration test skips in this environment exactly like its Cash Voucher counterparts already do, since `TEST_DATABASE_URL` is unset here).

**Verified live**, against the real dev server + real Neon DB + real Gmail SMTP (`EMAIL_MODE=live`), via direct API calls to the actual routes (no browser automation available in this environment): submitted a real **NEFT-advance** (Particulars: Conveyance ₹500 + Others "Venue booking deposit" ₹1,500 = ₹2,000, no Tax Invoice attached) → got `ADV/MCCIA/2026-27/0001` → confirmed via direct DB query `basic_amount`/`gst_amount` both null, `nature_of_expenditure` correctly mirrors `purpose_of_advance`, `advance_particulars` rows correct → ran the full pipeline (authority-approve → receive → verify → save "Amount Sanctioned" ₹2,000) → **recorded a ₹500 partial payment then the ₹1,500 final payment via the existing, completely unmodified `payment-entries` route** — `isFinal: false` then `true`, exactly as the prior session's multi-part-payment mechanism already worked for regular NEFT → confirmed the row landed in the `fully_payment_settled` tab and NOT in `payment_done` (Cash's tab) → downloaded and visually inspected the real PDF: `ADV/MCCIA/2026-27/0001` as the primary number, "Purpose of Advance" box, "Amount Sanctioned" label, correct 3-column Particulars table with Total row, "Previous Pending Advance : None," all three stamps present and correctly dated, Sanctioned box still blank → confirmed the admin detail page's rendered HTML shows all the same content plus the Payment History audit trail with both real entries → confirmed 0 `EMAIL_SEND_FAILED` audit rows (all real emails sent successfully). Submitted a real **Cash-advance** (Particulars: Snacks/Lunch ₹300 + Traveling ₹500 = ₹800, Previous Pending Advance ₹1,000 since 01/07/2026) → got `ADV/MCCIA/2026-27/0002` (confirming the shared counter — continuing from the NEFT-advance's `0001`, not restarting) **and** a normal `CASH/MCCIA/2026-27/0008` (confirming Cash's own series still allocates independently alongside it) → ran through the pipeline → confirmed `POST .../payment-entries` correctly 409s "only available for NEFT Payment Advices" for it → called the **old, completely untouched** `POST .../payment-done` route → 200, exactly as before → downloaded and visually inspected the real Cash Voucher PDF: `ADV/MCCIA/2026-27/0002` as the primary "No.", Purpose of Advance + Previous Pending Advance box, PARTICULARS-labeled items table with category names and correct total, Sanctioned box still blank (never had one to begin with) → confirmed the row landed only in the Cash-scoped `payment_done` tab and not in `fully_payment_settled`, and vice versa for the NEFT-advance — no leakage either direction. **Regression-checked regular (non-advance) submissions explicitly**: a plain NEFT submission with Basic/GST still requires Tax Invoice (confirmed 400 without it, 200 with it) and its downloaded PDF renders with zero visual change — `MCCIA/2026-27/0053` serial, "Basic Amount/GST Amount/Total" layout, "Bill passed for Rs." label (not "Amount Sanctioned"), "Nature of Expenditure" (not "Purpose of Advance"), no Particulars table; a plain Cash submission with line items also still submits correctly with a normal `CASH/MCCIA/2026-27/0009` and `advance_no` correctly null. All test data (4 advices, their attachments + real Vercel Blob uploads, 1 throwaway `admin_users` login) deleted afterward, individually confirmed via direct DB/Blob queries, not assumed.

`tsc --noEmit`, ESLint, the full Vitest suite (252 passing, 7 pre-existing skipped), and `next build` all clean.

### Shipped — Advance Payment refinement: payee = submitter, Bill & Reference hidden, bank details optional, dedicated "Advance Payment" admin tab (Claude Code, 2026-08-18)
Extends the Advance Payment feature above — none of it rebuilt, all four changes are additive on top of `is_advance`/`advance_no`/`advance_particulars`.

**1. Payee = Submitter, live-tested in a real browser.** When `isAdvance`, the vendor typeahead on "Payee / Company Name" is replaced with a plain editable `Input`, and Payee Name/Email auto-fill from Submitter Name/Email — new `lib/form/source-field-autofill.ts` (`resolveSourceFieldAutoFill`), a generalized version of the existing `resolveAutoFillEmail` staff-match pattern (same "fill once, never fight a manual edit, only re-derive on an actual source-value change" rule, tracked via a `lastAutoFilled*Ref`), wired via two new `useEffect`s in `PaymentAdviceForm.tsx` keyed on `[isAdvance, submittedByName]` / `[isAdvance, submittedByEmail]`. Address/Contact Phone/GSTIN/Udyam are left blank/editable — these don't exist on `staff_members`, consistent with the existing "known fields auto-fill, rest stays editable" convention `applyVendor` already follows.

**2. "3. Bill & reference" fully hidden for advances** — Bill No./Date, P.O. No./Date, Delivery Challan No./Date are not rendered at all (not just optional-but-visible) when `isAdvance`. `billNo`/`billDate` changed from unconditionally-required schema fields to `optionalTrimmed()`/`optionalDateString()`, required only in `superRefine`'s non-advance branch (alongside a `isFutureDateString()` helper replacing the old `.refine()`-based future-date check, since a conditionally-required field can't use a Zod-level `.refine()` on the base schema).

**3. Bank details optional for NEFT-routed advances** — `bankAccountNo`/`bankIfsc`/`beneficiaryName`'s `superRefine` requirement is now gated `data.paymentMode === "NEFT" && !data.isAdvance`; fields stay visible/editable on the form (label now reads "Optional" not "Required," plus a one-line note explaining why) in case the submitter wants to supply them anyway. Cash-routed advances were already unaffected (no bank fields render for Cash regardless).

**A real, independently-discovered bug, not a design decision — found only because this session used actual browser automation, not curl:** react-hook-form registers an uncontrolled input's native default value (`""` for text/date, `NaN` for a `valueAsNumber`-registered empty number field) the moment it first mounts, and **retains that stale value in form state after the field unmounts** (default `shouldUnregister: false`). Since `paymentMode` defaults to `"NEFT"` on page load, `billDate`/`poDate`/`deliveryChallanDate`/`basicAmount`/`gstAmount` are *always* registered before any mode switch — so a submitter who goes straight to "Advance Payment" (the overwhelmingly common path) had those stale invalid values silently block submission on every single attempt, with **no visible error anywhere**, since the `Field` wrapper that would show it is unmounted. Root cause: `optionalDateString()`'s regex ran *before* its empty-to-undefined transform (so `""` failed the regex before ever being forgiven), and `z.number().optional()` doesn't forgive `NaN` (only `undefined`). Fixed at the schema level, not via scattered `setValue` resets in every mode-switch handler (which would be fragile and easy to miss — `previousPendingAdvanceSince`, hidden/shown based on `previousPendingAdvanceAmount > 0`, has the exact same latent failure mode and is fixed by the same schema change): `optionalDateString()` now uses the same `optionalTrimmed().pipe(z.string().regex(...).optional())` ordering already established for `payeeContactPhone`/`payeeGstin`/`bankIfsc`; new `optionalNumber()` helper wraps `basicAmount`/`gstAmount` in `z.preprocess` to convert `NaN` → `undefined` before the type check. **This also fixes a pre-existing bug with zero connection to Advance Payment**: switching from the default NEFT straight to Cash without ever touching Basic/GST had the identical silent-failure mode — confirmed via a new regression test, not just reasoned about. New tests: 2 in the Advance describe block (stale `""`/`NaN` across all 5 affected fields; stale `""` `previousPendingAdvanceSince`), 1 in the Cash describe block (stale NaN `basicAmount`/`gstAmount` on a Cash submission).

**4. New admin tab, "Advance Payment"** (`lib/admin/filters.ts`) — lands an authority-approved advance (`is_advance = true AND authority_approved_at IS NOT NULL AND finance_received_at IS NULL`, i.e. "Awaiting Finance Review"'s own condition plus `is_advance = true`) separately from the shared bill-review queue at the exact point it first needs Finance's attention. **Confirmed with the human before building**: the separation is deliberately *only* at this landing point, not maintained through the rest of the pipeline — once Finance marks it Received, it falls out of "Advance Payment" (no `is_advance` condition anywhere past this one tab) and into the same shared Received & In Process / Verify / Payment tabs every regular submission uses. "Awaiting Finance Review" correspondingly narrowed to `is_advance = false`, so an approved advance never appears in both tabs. No other tab gained an `is_advance` condition — `waiting_authority` still shows a not-yet-approved advance exactly like any submission, and every stage past "Advance Payment"/"Awaiting Finance Review" is unconditionally shared, confirmed by a new test asserting no other stage tab's bound SQL params include a boolean at all.

**Live-tested end-to-end** against the real dev server + real Neon DB, via a **temporary Playwright install** (same "temporary, not a permanent toolchain addition" convention as the 2026-08-06 and 2026-08-06-Playwright sessions — `git diff package.json package-lock.json` confirmed empty afterward; Chromium was already cached) for the parts that are genuinely browser/React behavior, plus direct `curl` calls to the real routes for the pipeline/tab parts: filled Section 1 as a non-staff-matched submitter, confirmed the vendor-search help text and Bill No. field are both present in NEFT mode → switched to "Advance Payment" → confirmed the vendor-search help text disappeared and was replaced by the auto-fill help text, Payee Name/Email auto-filled to the submitter's own name/email, a manual edit to Payee Name was NOT immediately overwritten (sticky), Bill No. disappeared entirely, and the bank-fields-optional note appeared → filled Particulars (Conveyance ₹500 + Others "Venue booking deposit" ₹1,500), Purpose of Advance, left bank fields and Previous Pending Advance's amount at their defaults → attached only the Approval/Budget Letter (deliberately no Tax Invoice) → submitted successfully (this is what first surfaced the RHF-staleness bug above — the submission silently did nothing until the schema fix landed) → got `ADV/MCCIA/2026-27/0004`, confirmation page correctly omits the "Bill No." row for an advance (new: hidden via `!summary.isAdvance` in `app/submitted/[serial]/page.tsx`, `SubmissionSummary.billNo` typed to fall back to `""` since the field can now be legitimately absent client-side) → confirmed via `curl` identity-confirm + approve against the real authority-approval routes that it landed in `?tab=advance_payment` and was absent from `?tab=awaiting_finance` → called the real `receive` route → confirmed it moved out of `advance_payment` into `received_in_process`, proving the "landing point only" behavior end-to-end, not just by reading the filter condition. All test data (1 advice + 1 attachment + its real Vercel Blob upload, 1 throwaway `admin_users` login) deleted afterward; Playwright fully uninstalled, confirmed via empty `git diff` on `package.json`/`package-lock.json`.

**A judgment call, flagged rather than decided silently**: `bill_no`/`bill_date` stay `NOT NULL` DB columns (no migration) — for an advance, `app/api/submit/route.ts`/`app/api/edit/[token]/route.ts` fill them server-side with `advance_no` (falling back to `serial_no`) and `form_date` respectively, the same dual-representation pattern `purpose_of_advance` → `nature_of_expenditure` already established earlier in this feature. Considered making the columns nullable instead, but that would have rippled into every existing reader that assumes a non-null `billNo`/`billDate` string (both PDF templates, the admin detail page, Excel export, the authority-approval email's `billReference`) for no real benefit — Finance never sees these values as "the bill number," they're an internal fallback reference only. **Also fixed as a byproduct**: `app/api/submit/route.ts`'s `notifyAuthorityApproval` call was missing the `isAdvance` branch on `natureOfExpenditure` that `app/api/edit/[token]/route.ts`'s equivalent call already had (a pre-existing inconsistency between the two routes, from the original Advance Payment session) — an advance's authority-approval email would have shown an empty Nature of Expenditure/Purpose line. Fixed to match.

**Tests**: `lib/form/source-field-autofill.test.ts` (new, 8 tests, mirrors `staff-email-autofill.test.ts`'s shape), `lib/validation/payment-advice.test.ts` (+5: bank details optional for NEFT-advance + still-accepted-if-provided, billNo/billDate/PO/Challan not required for advance, the two RHF-staleness regression tests above, billNo/billDate/future-billDate required for non-advance), `lib/admin/filters.test.ts` (+3: `advance_payment`'s condition, `awaiting_finance`'s narrowed condition, no other stage tab carries an `is_advance` condition).

`tsc --noEmit`, ESLint, the full Vitest suite (271 passing, 7 pre-existing skipped), and `next build` all clean.

### Shipped — Advance Payment moved off the main form onto its own route, `/advance` (Claude Code, 2026-08-18)
Pure UI restructuring — none of the backend/validation/numbering/routing/admin-tab logic from the two entries above changed at all. The reason: embedding Advance Payment as a third Payment Mode radio inside the main form meant fields conditionally appeared/disappeared with no clear separation, which was confusing in practice.

**`components/form/PaymentAdviceForm.tsx` gained a required `mode: "standard" | "advance"` prop** — fixed per page, never toggled at runtime. `isAdvance` is now a plain `const isAdvance = mode === "advance"` derived from the prop (previously a `useWatch`'d/`setValue`'d form field toggled by a 3-way radio). The component itself is the "shared component" both routes render — this was the deliberate choice over splintering it into many small subcomponents: the underlying logic (submitter/payee auto-fill, Particulars, attachment handling, the submit handler) is deeply interdependent, already lived in one well-tested place, and a `mode` prop reuses all of it exactly rather than duplicating markup, which is what the brief actually asked to avoid.

- **Section 4 "Payment mode" simplified back to a plain 2-way NEFT/Cash radio** for *both* modes — the old 3-way radio (NEFT / Cash / Advance Payment) and its secondary "Advance routes via" sub-radio are gone entirely. Being on `/advance` already means it's an advance; the NEFT/Cash choice made there still determines dashboard routing exactly as before.
- **Section 3 "Bill & reference" → "3. Advance details" when `mode === "advance"`** (heading only changes; was previously mislabeled "Bill & reference" even while showing Particulars) — the Bill No./Date/P.O./Delivery Challan fields render only when `mode === "standard"`, so on `/advance` they are structurally absent from every render, not conditionally hidden.
- **Section 6 "Documents": the Tax Invoice `FileUploadSlot` is not rendered at all when `mode === "advance"`** (previously present-but-optional) — Approval/Budget Letter becomes the first Documents slot on that page.
- Submit button text is mode-aware: "Submit Advance Payment Request" vs "Submit Payment Advice" (still "Resubmit" in edit mode).
- **`app/page.tsx`** — Payment Mode is back to NEFT/Cash only; passes `mode="standard"`; gained a visible banner (bordered/tinted box, not fine print) linking to `/advance`.
- **`app/advance/page.tsx`** (new) — same structural shape as `app/page.tsx` (logo/header/intro-box), heading reads "Advance Payment Request" (unambiguous vs. "Payment Advice"), intro copy explains the advance-to-requester model, a link back to `/` for the regular form, passes `mode="advance"`.
- **`app/edit/[token]/page.tsx`** — now passes `mode={advice.isAdvance ? "advance" : "standard"}`, so a SENT_BACK advance resubmits through the same reduced field set it was originally submitted through, and a SENT_BACK regular submission still gets the full standard form.

**A second real bug found via live browser testing, distinct from the previous session's RHF-staleness fix**: the Particulars section's "seed one default row if the array is empty" logic lived in a `useEffect` gated on `isAdvance`. In the old toggle-based form, `isAdvance` started `false` on mount, so this effect was a no-op on initial mount and only ever ran later, from a genuine user-triggered state change (clicking the radio) — never subject to React Strict Mode's dev-only double-effect-invocation (which only doubles *initial mount* effects). Now that `isAdvance` is `true` from the very first render on `/advance`, this same effect runs *during* initial mount — which Strict Mode invokes twice against the same stale closure, silently seeding **two** empty Particulars rows instead of one. Both rows rendered separately in the DOM, but a real user would only ever notice and fill the first one — the second's `amount` stayed `0`, failing the schema's per-row `positive()` check, and the top-level submit silently did nothing. Fixed by seeding the row directly in `useForm`'s `defaultValues` (`advanceParticulars: isAdvance ? [{ category: "CONVEYANCE", amount: 0 }] : []`, overridden by `...prefill` for edit/resubmit as before) instead of via an effect — synchronous initial state isn't subject to the double-invocation hazard at all. The effect now only computes the live total, nothing else.

**Live-tested end-to-end** against the real dev server + real Neon DB, via another **temporary Playwright install** (uninstalled after, empty `package.json`/`package-lock.json` diff confirmed): confirmed the main form's Payment Mode radios are exactly `["NEFT", "Cash"]` with no third option and Bill No. still renders unconditionally there; confirmed `/advance`'s heading, the total absence of both "Bill No." and "Tax Invoice" anywhere in its rendered DOM, the vendor-search help text's absence, Payee Name auto-filling from Submitter Name, exactly **one** Particulars row present on load (this is what caught the Strict Mode bug above — first attempt had two, silently blocking submission), and a link back to `/` → filled and submitted a real advance end-to-end → got `ADV/MCCIA/2026-27/0005` → confirmed via `curl` identity-confirm + approve that it landed in `?tab=advance_payment` and was absent from `?tab=awaiting_finance`, identical to the previous session's verification. Test data (1 advice + 1 attachment + its real Blob upload, 1 throwaway `admin_users` login) deleted afterward. Did **not** separately re-verify a SENT_BACK advance's resubmit flow through `/edit/[token]` in an actual browser this session (the `mode` prop wiring there is a single-line, type-checked change reusing the exact same component both other routes were just verified against) — flagged here rather than silently assumed identical.

**Tests**: no new test files — this session's changes are presentational (which sections render, page routing) and were verified via live browser + `curl`, not unit tests; the existing `lib/validation/payment-advice.ts` schema, `lib/admin/filters.ts` tab logic, and their respective test suites are completely unchanged and still pass. `tsc --noEmit`, ESLint, the full Vitest suite (271 passing, 7 pre-existing skipped), and `next build` all clean.

### Shipped — Advance Payment's Particulars simplified from a category dropdown to plain description+amount, matching Cash Voucher exactly (Claude Code, 2026-08-18)
Pure simplification, requested because the preset-category-dropdown + conditional "Other" field design was more than the actual use case needed — Particulars now behaves identically to Cash Voucher's line items in every respect: free-text description, amount, Add row / Remove, live-summed Total.

**New shared component, `components/form/LineItemsField.tsx`** — extracted from the (previously duplicated-in-spirit) Cash Voucher line-items JSX, since the two were now byte-for-byte the same interaction pattern. Takes `name: "cashVoucherItems" | "advanceParticulars"` plus per-context `heading`/`helpText`/`descriptionPlaceholder`, and owns its own `useFieldArray` for rendering/Add/Remove — react-hook-form supports multiple `useFieldArray` calls against the same field name sharing state via `control`, so `PaymentAdviceForm.tsx` (which still needs `appendCashVoucherItem` itself, to seed a row when the submitter switches to Cash) and this component both stay in sync without prop-drilling the field array state. Both the Cash Voucher block and the Particulars block in `PaymentAdviceForm.tsx` now render `<LineItemsField>` — zero duplicated add/remove/sum JSX between them.

**Validation (`lib/validation/payment-advice.ts`) — `advanceParticulars` now reuses `cashVoucherItemSchema`/`calculateCashVoucherTotal` directly, not a parallel schema.** Deleted entirely: `ADVANCE_PARTICULAR_CATEGORIES`, `advanceParticularCategorySchema`, `AdvanceParticularCategory`, `ADVANCE_PARTICULAR_CATEGORY_LABELS`, the old `advanceParticularSchema` (category + optional otherDescription + amount), and `calculateAdvanceParticularsTotal` (was byte-for-byte identical to `calculateCashVoucherTotal` already). The superRefine's Advance branch lost its per-row "otherDescription required when category is OTHER" check — `cashVoucherItemSchema`'s own `description` field (`requiredTrimmed`) already enforces a non-empty description for every row, matching Cash Voucher's existing rule exactly.

**Schema — `advance_particulars` table (`lib/db/schema.ts`) — `category`/`other_description` dropped, replaced with a single `description text not null` column, matching `cash_voucher_items`' shape.** Two migrations, not one, specifically because **real production data already existed** (3 rows on a live advance a real user had already submitted, discovered via a live DB check before touching anything): `0012_secret_speed.sql` adds `description` as nullable first; a one-off backfill script (not a migration — same "hand-run once, not part of the migration chain" precedent as the Kopardekar merge) populated it from the old `category`+`other_description` values via the same label mapping the UI used to show (`CONVEYANCE` → "Conveyance", etc., `OTHER` → the row's `other_description` or a fallback); `0013_military_runaways.sql` then sets `description` `NOT NULL` and drops both old columns, only after every row had a real value. All 3 real rows verified correct post-migration, not assumed.

**PDF — `lib/pdf/PaymentAdviceDocument.tsx`'s Particulars table lost its "Category" column**, now a plain two-column Description/Amount table (80%/20% width) exactly mirroring Cash Voucher's own items table layout; `particularCategoryLabel()` helper deleted. `lib/pdf/CashVoucherDocument.tsx` needed no code change at all — it already rendered `{description, amount}[]` generically regardless of source table (only its doc comment mentioned the old category+otherDescription shape, fixed). `lib/pdf/render.tsx`'s particulars mapping simplified to `{description: p.description, amount: p.amount}` in both `renderPaymentAdvicePdf` and `renderCashVoucherPdf` — the label-lookup/`" — {otherDescription}"` concatenation logic is gone.

**Admin detail page (`app/admin/advice/[id]/page.tsx`)** — the Advance Details particulars table lost its Category column, now Description/Amount, matching the existing Cash Voucher Items table's exact structure one section below it.

**Live-tested end-to-end** against the real dev server + real Neon DB, via another **temporary Playwright install** (uninstalled after, empty `package.json`/`package-lock.json` diff confirmed): confirmed zero `<select>` elements anywhere on `/advance`; added 3 Particulars rows (Taxi fare ₹450 + Hotel ₹6,200 + Conference fee ₹3,500), confirmed the live-displayed Total read exactly "₹ 10,150.00" → submitted → got `ADV/MCCIA/2026-27/0006`, confirmation page's AMOUNT matched → downloaded the real PDF and read it directly: Particulars table shows all 3 rows as plain Description/Amount pairs with the correct Total row, no Category column anywhere, all other content (stamps, Purpose of Advance, Previous Pending Advance "None") unaffected → confirmed the admin detail page's rendered HTML shows the same 3 descriptions/amounts with no Category column. Test data (1 advice + 1 attachment + its real Blob upload, 1 throwaway `admin_users` login) deleted afterward, and the 3 pre-existing **real production** `advance_particulars` rows (from `ADV/MCCIA/2026-27/0003`, submitted before this session) were confirmed to have migrated correctly — not deleted, not test data.

**Tests**: `lib/validation/payment-advice.test.ts` updated — the advance-particulars fixture now uses `description` instead of `category`; the OTHER-category-specific tests replaced with a generic "requires a description" / "accepts a single free-text row" pair mirroring Cash Voucher's own tests; the Particulars-total test now calls `calculateCashVoucherTotal` directly (asserting the reuse, not just the arithmetic). New `lib/db/migrations/advance-particulars-description-migration.test.ts` (3 tests: 0012's SQL is exactly the nullable ADD COLUMN, 0013's SQL contains the SET NOT NULL + both DROP COLUMNs, and the final snapshot has `description` notNull with `category`/`other_description` absent).

`tsc --noEmit`, ESLint, the full Vitest suite (274 passing, 7 pre-existing skipped), and `next build` all clean.

### Shipped — Authenticated Recommending Authority dashboard (Codex, 2026-09-03)
- `admin_users.role` now accepts `AUTHORITY`; new nullable FK `recommending_authority_id` links only those accounts to `recommending_authorities` (migration `0014_easy_magdalene.sql`, applied live). JWT payloads carry the linked ID and validate that AUTHORITY sessions have it while Finance sessions do not. Proxy routing strictly separates `/admin*` from `/authority*`.
- New `/authority/login` and `/authority` dashboard use the existing email+bcrypt+JWT pattern. Default view shows only the logged-in authority's currently pending submissions; History is read-only and shows their approved/sent-back decisions. Both queue queries and every action/attachment endpoint scope by the session's linked authority ID. No Finance pipeline states are shown.
- Extracted `performAuthorityApproval()` / `performAuthorityRejection()` into `lib/advice/authority-actions.ts`; both the old token routes and new authenticated routes call these same functions. The `/authority-approval/[token]` route, token behavior, and email identity-confirmation gate were not removed or bypassed.
- `scripts/seed-admin-users.ts` now idempotently covers all three Finance accounts plus all **12 active AUTHORITY accounts**. Every authority name must exactly match one existing `recommending_authorities` row; matching active accounts are skipped without changing passwords, conflicting rows abort, and passwords are generated/printed only for newly inserted accounts. The eight-account 2026 expansion batch deliberately uses lowercase first name + `@2026` for easy initial distribution; the three Finance and original four Authority accounts retain random initial-password generation. Current AUTHORITY accounts (all active and uniquely linked): ANIRUDDHA BRAHMA, Chintamani Shrotri, DG, Ganesh Mate, MANGESH KULKARNI, Neeraj Thakur, Nikhil Jain, PRASHANT JOGALEKAR, RAJNIKANT  GAIKWAD, Satavisha Natu, SHANTANU JAGTAP, and SUDHANWA KOPARDEKAR. The exact inactive `AI Studio` authority remains deliberately excluded and has no login.
- Live verification: two temporary accounts linked to Aniruddha and Chintamani proved no cross-visibility. Real pending `MCCIA/2026-27/0046` appeared only for Aniruddha, was approved via the authenticated route, disappeared from Pending, appeared in History, and its unchanged token URL still returned 200 with "You already approved this." Temporary accounts were deleted afterward. TypeScript, ESLint, 279 tests (7 pre-existing skipped), and production build pass.

### Shipped — Change Password, self-service for any admin_users account (Claude Code, 2026-09-03)
Requested because every `admin_users` password (Sunil's, Abha's, the ALL account's, and now the AUTHORITY accounts Codex's dashboard above adds) could only ever be *set*, once, by a human running `scripts/seed-admin-users.ts` — nobody signed in could change their own. Built directly on top of Codex's same-day Authority dashboard work (found mid-session as live, uncommitted, undocumented WIP — confirmed with the human it was Codex actively finishing it before proceeding, per §0 rule 7).
- New shared route `POST /api/account/change-password` (`app/api/account/change-password/route.ts`) — deliberately **not** under `/api/admin/` or `/api/authority/`, since both of those prefixes are role-gated in `proxy.ts` (Finance-only / Authority-only respectively) and this needs to work for *either*. `proxy.ts` gained a new `/api/account/*` branch requiring only "some valid admin_users session," checked before the two role-specific branches — the only change made to `proxy.ts`; the existing Finance/Authority routing logic Codex just wrote was not touched.
- Verifies `currentPassword` via the existing `verifyPassword()`/bcrypt (`lib/admin-users.ts`, `SALT_ROUNDS = 12` — reused as-is, no second hashing configuration introduced) before allowing any change; wrong current password → `401`, no write. New password: min 8 characters, must match confirmation, must differ from the current password — all three enforced by one shared Zod schema (`lib/validation/account.ts`'s `changePasswordFormSchema`, `superRefine`) used by both the client form and the server route, same "one schema" convention as every other form in this app. The differs-from-current check is a plain string compare against the already-bcrypt-verified `currentPassword`, not a second `bcrypt.compare` — equivalent and cheaper.
- On success: hashes with `hashPassword()` (same bcrypt config), updates `admin_users.password_hash`, and in the same transaction writes an `audit_log` row (`action: "ADMIN_PASSWORD_CHANGED"`, `actor: "{fullName} <{email}>"`, `paymentAdviceId: null`, `details: {}`) — no password material anywhere in it, same reasoning as `AUTHORITY_IDENTITY_CHECK_FAILED`. Session is left valid (no forced re-login); the success message tells the user their new password takes effect next sign-in.
- Account menu: new shared `components/account/AccountMenu.tsx` (click-to-open dropdown, closes on outside click) replaces the plain name/role text in both `app/admin/layout.tsx`'s header and `app/authority/layout.tsx`'s header — same component, different props (`changePasswordHref`, `logoutEndpoint`, `loginPath`), matching this codebase's existing "shared component, mode/prop-driven" pattern rather than two near-duplicate menus. `LogoutButton` gained an optional `className` prop (default unchanged, `"hover:text-white"`) so it can be restyled to sit inside the dropdown's white background instead of the navy header bar it originally assumed. New pages `/admin/change-password` and `/authority/change-password`, both thin wrappers around one shared `components/account/ChangePasswordForm.tsx` (react-hook-form + `zodResolver`, `Field`/`Input`, same shape as `VendorForm.tsx`).
- **Verified live**, against the real dev server + real Neon DB: created one throwaway `admin_users` test account directly in the DB (role `ALL`, not through the seed script) → logged in with its real password → confirmed each guard individually: wrong current password → `401` "Current password is incorrect."; new password under 8 chars → `400`; confirmation mismatch → `400`; new password identical to current → `400` "must be different" — none of these four attempts touched the DB (`db.transaction` never called, confirmed at the unit-test level too) → a correct change → `200`, and the **same session cookie** still worked immediately afterward (`GET /admin` → `200`, no forced logout) → logged out, confirmed the **old** password now `401`s at `/api/admin/login` and the **new** one `200`s → queried `audit_log` directly: exactly one `ADMIN_PASSWORD_CHANGED` row, correct actor string, `details: {}`, and grepped the dev server's stdout log for both the old and new plaintext passwords — zero matches. Deleted the test account and its audit row afterward. Also confirmed via a role-`AUTHORITY` unit test case that the route has no role check at all — it works identically for Finance and Authority sessions, per the brief.
- New tests: `lib/change-password-route.test.ts` (8 cases — no-session 401, short-password 400, mismatched-confirmation 400, same-as-current 400, unknown/inactive-user 404, wrong-current-password 401 with zero DB writes, successful change with the exact audit-row shape asserted including a no-password-material check via string search on the serialized row, and the AUTHORITY-role case above).
- **Did not touch**: `lib/auth.ts`, `lib/db/schema.ts`, any migration, or `scripts/seed-admin-users.ts` — all Codex's active work from the entry immediately above; this feature needed none of them. Did not re-verify the Authority dashboard itself beyond confirming its files were unmodified by this session (`git status` before/after).

`tsc --noEmit`, ESLint, the full Vitest suite (287 passing, 7 pre-existing skipped), and `next build` all clean.

### Shipped — Standard NEFT Enclosures and Special Remarks required (Codex, 2026-09-03)
- Section 5 now marks Enclosures and Special Remarks with the shared red `Required` treatment only when `paymentMode === "NEFT" && !isAdvance`; Cash and `/advance` continue to display `Optional`.
- The shared `paymentAdviceFormSchema` adds trimmed, non-empty errors under the same condition, so React Hook Form, `/api/submit`, and `/api/edit/[token]` enforce one identical rule client- and server-side.
- Added focused validation coverage for each field empty, both empty, regular Cash remaining optional, and NEFT-routed Advance remaining optional. Updated the existing valid NEFT resubmission fixture with both fields.
- Live local verification: rendered `/` shows both labels Required; `/advance` shows both Optional. Real local `/api/submit` validation attempts with each NEFT field empty returned `400` with `Enclosures are required` / `Special Remarks are required`, before any DB write. Browser-control was unavailable, so no clicked React interaction was claimed; the same shared schema used by `zodResolver` is covered directly. TypeScript, ESLint, 292 tests (7 pre-existing skipped), and production build pass.

### Shipped — Authority dashboard “My Submissions” view (Codex, 2026-09-03)
- `/authority` now has a third read-only tab, `?view=my-submissions`, alongside Pending My Approval and History. It shows reference number using the shared document-identity helper, payee/particulars, amount, submitted date, full derived Finance stage, and retained sent-back remarks.
- Scope is an exact `payment_advices.submitted_by_email = admin_users.email` match. The page reloads the active session user's email from `admin_users` by `session.adminUserId`; it does not add email to or trust the JWT. This assumes authorities submit with the same official email used by their login, as explicitly selected in the brief. Current seeded authority accounts and authority/staff source data use the same official addresses, so no mismatch was found.
- New pure `pipelineStageFor()` derives Waiting on Authority / Awaiting Finance Review / Received & In Process / Verified—Ready for Payment / Partial Payment Done / Fully Payment Settled / Payment Done / Sent Back from the existing status and timestamps. Eight-stage unit coverage added.
- The My Submissions branch never renders `AuthorityQueueActions` and does not load approval attachments, so it is strictly read-only; existing edit-token resubmission remains the only correction path.
- Live-tested with two real AUTHORITY accounts using signed sessions without reading/changing their passwords. Submitted temporary NEFT `MCCIA/2026-27/0061` through `/api/submit` using Aniruddha's login email: it appeared only in Aniruddha's My Submissions at Waiting on Authority, not Chintamani's, with zero Approve/Send Back controls. Preview-only email mode used. Advice, audit rows, generated fixture, and both Blob files deleted afterward. TypeScript, ESLint, 300 tests (7 pre-existing skipped), and production build pass.

### Shipped — Change Password page centered (Codex, 2026-09-03)
- Both `/admin/change-password` and `/authority/change-password` already used the same `ChangePasswordForm`, but duplicated their heading/description wrappers. Added shared `ChangePasswordPageContent` in the same component module so the whole column—heading, copy, and form—is now one `mx-auto w-full max-w-sm` layout for both areas, with only account-specific description copy passed by each route.
- Live-rendered authenticated Authority HTML confirmed the shared centered wrapper and correct page content. The in-app browser connection was unavailable, so no visual screenshot claim was made; structural rendering plus the identical shared component used by both routes was verified. TypeScript, ESLint, and all 300 tests (7 pre-existing skipped) pass.

### Shipped — Change Password back navigation (Codex, 2026-09-03)
- The shared `ChangePasswordPageContent` now renders the existing `BackLink` above the title, so Finance Admin and Authority receive the same visual and history-aware navigation convention as other admin pages.
- Each thin route wrapper supplies its own direct-entry fallback: `/admin/change-password` returns to `/admin`, while `/authority/change-password` returns to `/authority` (whose default view is Pending My Approval). The shared component is therefore context-aware rather than hardcoded to either dashboard.
- TypeScript, ESLint, all 300 tests (7 pre-existing skipped), and the production build pass. Authenticated browser click-through could not be repeated this session because no browser session was connected, and the environment correctly refused minting impersonation sessions for real accounts; destination props and the shared rendered component path were verified in source/build without claiming a live click test.

### Shipped — Authority View-first approval detail workflow (Codex, 2026-09-03)
- Pending My Approval rows now contain one `View` action and no inline Approve/Send Back controls. History retains its decision summary and adds the same `View` action. The dashboard no longer preloads attachment metadata for every row.
- New authority-scoped `/authority/advice/[id]` shows the full submission: document identity, submitter/date/department, payee/contact/tax details, bill/reference fields where applicable, Basic/GST/total or Cash/Advance line-item breakdowns, narrative/enclosures/remarks, payment details, and every stored attachment. The existing authenticated attachment route remains scoped by both advice ID and the session's `recommendingAuthorityId`; it now serves every attachment type shown on this full-detail page, not only the two mandatory types.
- Pending details mount the existing `AuthorityQueueActions` unchanged, reusing its existing scoped approve/reject APIs and required-remarks behavior. Approved/sent-back details render a read-only decision record with no action component. The shared history-aware `BackLink` returns to Pending or History, with `/authority` or `/authority?view=history` as the matching direct-entry fallback.
- Live-tested through a normal login using an isolated throwaway AUTHORITY account and advice: Pending contained View with zero inline action buttons; detail showed the full amount breakdown and actions; approving through the existing API moved the advice into History; History detail had zero actions and displayed its read-only decision record. A temporary `OTHER` PDF appeared on the detail page and downloaded from the scoped route as `200 application/pdf`. The account, advice, audit/attachment rows, and Blob were deleted afterward. TypeScript, ESLint, 300 tests (7 pre-existing skipped), and production build pass.

### Shipped — Finance Dashboard + `/admin/submissions` page split (Codex, 2026-09-03)
- `/admin` is now the Finance Dashboard; the unchanged working queue (tabs, filters, sorting, pagination, export, and table) moved to `/admin/submissions`. The Finance header now has separate Dashboard and Submissions links, with Dashboard first, and the MCCIA/Finance Admin brand links home. Advice-detail fallback navigation now targets `/admin/submissions`.
- The existing nine stage summary cards moved off the queue and onto Dashboard. Every card links to its matching `/admin/submissions?tab=...` view and carries the role's default `paymentMode` where applicable.
- Dashboard analytics: weekly submission counts for the last 90 days; mutually exclusive standard NEFT / standard Cash / Advance count-and-amount breakdown; top five payees by cumulative current-FY amount; average submitted-to-authority-approved duration; and current-FY submitted, paid/settled, and still-pending totals. Paid/settled means completed Cash amount plus recorded NEFT `total_paid`, capped at the submitted amount.
- Role scoping deliberately reuses one `defaultPaymentModeForRole()` helper in both Dashboard and Submissions: PAYMENT_ADVICE → NEFT, CASH_VOUCHER → CASH, ALL → unscoped. It remains a default view/data scope, not an authorization wall. Current data volume was checked read-only before implementation (13 rows); Dashboard performs fixed stage aggregates plus one current-FY projection, so no periodic precomputation is warranted at present.
- Live-rendered the production build through normal logins for temporary ALL and PAYMENT_ADVICE accounts: ALL showed the combined overview and unforced card links; PAYMENT_ADVICE showed the NEFT-focused label, NEFT-prefiltered card links, and `/admin/submissions` defaulted to NEFT. Both rendered all analytics areas and both nav items. Temporary accounts were deleted. TypeScript, ESLint, 303 tests (7 pre-existing skipped), and production build pass.

### Shipped — Public Finance/Authority Login menu (Codex, 2026-09-03)
- Added a shared top-right `Login` dropdown to both `/` and `/advance`. It opens on the public page and offers `Finance Admin Login` → `/admin/login` and `Authority Login` → `/authority/login`; those existing login flows remain responsible for credential validation and redirect to `/admin` and `/authority` respectively.
- The dropdown closes on selection, outside click, or Escape and includes menu ARIA semantics. Its wrapping header layout remains responsive for narrow screens.
- Follow-up: anchored the control to the header's actual top-right at `sm` and above, with reserved title-block padding to prevent overlap; this stops long institutional copy from wrapping the button onto a lower row. Small screens retain the natural wrapped layout.
- Production-rendered `/` contains the Login control and both login routes return 200. The in-app browser connection was unavailable, so no visual/click interaction claim was made. TypeScript, ESLint, 303 tests (7 pre-existing skipped), and production build pass.

### Operations — Deliberate pre-launch production data reset (Human-executed; Codex verified 2026-09-03)
- Immediately before the Finance-team launch, the human deliberately wiped all demo/test submission data and reset numbering. This is expected production preparation, not data loss caused by an application bug.
- Mandatory local safety backup remains at `.local-backups/prelaunch-2026-09-03T16-38-11+0530/` (gitignored): JSON exports for 12 tables, 25 attachment Blobs, SHA-256 manifest, plus a supplemental checksum manifest and copies of 12 older orphaned test Blobs discovered during preflight. Codex verified every backup checksum before the human performed the deletion.
- Codex verified the live post-reset state read-only: `payment_advices=0`, `attachments=0`, `cash_voucher_items=0`, `advance_particulars=0`, `payment_entries=0`, `audit_log=0`, and Vercel Blob contains zero files. Preserved data matches the pre-wipe backup exactly: `admin_users=7`, `vendors=660`, `staff_members=51`, `staff_authority_options=59`, `recommending_authorities=13`.
- `serial_counters` has exactly the three current-FY rows at `last_number=0`: `PAYMENT_ADVICE`, `CASH_VOUCHER`, and `ADVANCE` for `2026-27`. The next real allocations will therefore be `MCCIA/2026-27/0001`, `CASH/MCCIA/2026-27/0001`, and `ADV/MCCIA/2026-27/0001`. **Do not create live test submissions after this checkpoint; they would consume the launch numbers.**
- Post-reset checks performed no writes or submissions: public `/`, `/advance`, `/admin/login`, and `/authority/login` return 200; unauthenticated `/admin`, `/admin/submissions`, and `/authority` redirect to the correct login pages. TypeScript, ESLint, 303 tests (7 pre-existing skipped), and production build pass.

### Verified — Public-form required/optional field audit (Codex, 2026-09-03)
- Audited shared `PaymentAdviceForm` labels against `paymentAdviceFormSchema` and the server submit/edit routes for standard NEFT, Cash Voucher, and Advance Payment conditional branches, including attachment presence/count validation.
- Confirmed **P.O. Date is optional**: the UI displays the gray `Optional` marker, the input has no native `required` attribute, and blank input is normalized to `undefined` by the shared client/server Zod schema. P.O. Number and both Delivery Challan fields are likewise optional; Bill Number and Bill Date remain required on non-advance submissions.
- Added regression coverage proving blank P.O. Number/P.O. Date pass standard NEFT validation while a supplied malformed P.O. Date is rejected. The deployed `/` page also renders `P.O. Date Optional`; no form was submitted, preserving the fresh `0001` counters.
- Verification: TypeScript and ESLint clean; Vitest **305 passed / 7 skipped**; production build clean (the first sandboxed build could not reach Google Fonts, then passed with network access).

## 4. Open Items (verify before building on top of these)

Status legend: 🔴 unverified / high risk · 🟡 unverified / lower risk · 🟢 verified

- 🟢 **Independent reference series grouped in Admin submissions queue 2026-09-04:** `/admin/submissions` now orders by business document type first (Payment Advice → Cash Voucher → Advance Payment), then sorts within each group using that type's actual displayed reference (`serial_no`, `cash_voucher_no`, or `advance_no`) rather than applying `serial_no` blindly across all types. Group headers make the separation explicit; the lightweight per-row type badge remains. This grouping stays in force with other column sorts, which sort within each type instead of mixing independent number series. Sent Back retains oldest-first ordering within each type group. Authenticated rendered-HTML verification using the real PAYMENT_ADVICE account confirmed MCCIA/2026-27/0009, /0008, /0007 are contiguous under Payment Advice and ADV/MCCIA/2026-27/0001 begins only under the later Advance Payment header.
- 🟢 **IST date handling + admin submission-type badges completed 2026-09-04:** all user-facing timestamp formatting now goes through shared `lib/date-time.ts` helpers with explicit `timeZone: "Asia/Kolkata"`; PostgreSQL `date` fields remain calendar-only and are never timezone-shifted. This covers Admin and Authority queues/details/actions, authority token review, PDF Submitted/Approved/Verified stamps, and all notification-email form dates. The public form's default/max date and date-validation “today” use the IST calendar day. Admin analytics' current FY and weekly buckets also use IST calendar keys. Most critically, `financialYearFor()` now derives calendar year/month in IST rather than from the server's local getters: executable boundary verification confirms `2026-03-31T19:00:00Z` = `01/04/2026, 12:30 am` IST → FY `2026-27`, while one millisecond before IST midnight remains `2025-26`. No stored dates or historical rows were rewritten. The `/admin/submissions` reference cell now includes a subtle `Payment Advice` / `Cash Voucher` / `Advance Payment` badge derived from `paymentMode + isAdvance`; a read-only authenticated render against real production rows confirmed all three labels alongside real references. Browser-control was unavailable, so no visual screenshot is claimed; the real rendered HTML, live production data mapping, boundary execution, tests, and build were verified.
- 🟢 **Production upload-size mismatch resolved 2026-09-04:** the real Cash Voucher failure around 13:16 IST was caused by all PDFs travelling through `/api/submit` despite Vercel's 4.5 MB Function request limit. `PaymentAdviceForm` now uploads every PDF directly from the browser with Vercel Blob's short-lived client-token flow (`/api/attachments/upload`), then sends only verified pathname/URL/name/size/doc-type metadata to `/api/submit` or `/api/edit/[token]`. The token itself enforces private PDF-only uploads and the existing 10 MB per-file maximum; final routes independently `head` each Blob, compare metadata, and read its `%PDF-` signature before saving. The shared component covers regular NEFT Payment Advice, Cash Voucher, and `/advance`; the edit route uses the same contract while retaining untouched existing files and replacing only newly uploaded document types. Serial allocation timing is unchanged: pre-submit files use random `pending-uploads/...` paths, which is safe because every attachment reader uses the DB-stored pathname. UI shows a running MB total and an upload phase; 413/non-JSON responses now produce an accurate size message. Partial client uploads are cleaned up when final submission fails, and server-side failures retain the existing cleanup. Live-tested the real token exchange/direct Blob transfer with two 3 MB PDF payloads (6,291,456 bytes combined, above the old ceiling); both objects were deleted and verified absent afterward. No production advice or serial was consumed. Browser-control was unavailable, so interactive visual click-through remains unclaimed; unit/integration coverage plus full tsc/lint/tests/build passed.
- 🟢 **Authority Dashboard account expansion completed 2026-09-03:** the human explicitly included DG and confirmed `engineer@mcciapune.com` for RAJNIKANT  GAIKWAD. Eight missing accounts were seeded, producing 12 active, uniquely linked AUTHORITY accounts in total; exact inactive `AI Studio` remains excluded. Live production login/dashboard checks passed for new Ganesh Mate and Nikhil Jain accounts. Both rendered their own identities and empty scoped queues and neither exposed the real `MCCIA/2026-27/0001` submission assigned to original authority Chintamani Shrotri. The original 3 Finance + 4 Authority accounts were explicitly skipped by the seed, not updated. No test submission was created.
- 🟢 **Predictable initial passwords applied to the eight-account expansion batch 2026-09-04:** after reviewing and explicitly confirming every generated value (including literal `dg@2026` for role-label DG), the human chose lowercase first name + `@2026` deliberately for ease of distribution. Only those eight existing password hashes were reset, together in one transaction; no duplicate accounts were created. A pre-reset hash backup is retained under `.local-backups/authority-password-reset-2026-09-04T06-50-44.541Z.json` (gitignored). All eight final bcrypt hashes were verified against the approved values. No forced-change flag, login redirect, or blocking behavior exists. Ganesh Mate live-tested normal login/dashboard access, voluntarily changed his password through the shared Change Password flow, authenticated with the replacement, then changed it back; his approved initial password was re-verified afterward.
- 🟢 **Change Password (self-service, any `admin_users` role) shipped and live-verified end-to-end 2026-09-03 by Claude Code** — see the "Shipped" entry above for the full detail: the shared `/api/account/change-password` route, the `proxy.ts` addition that authorizes it for any signed-in role, the account-menu dropdown now in both Finance Admin's and Authority's headers, and the live test that changed a real throwaway account's password, confirmed the session stayed valid, then confirmed via logout/login that the old password stopped working and the new one worked. Whichever of the four real AUTHORITY accounts get seeded per the item just above will have Change Password available immediately — no further wiring needed once they exist.
- 🟡 **Change Password has no "forgot password" / admin-reset path** — if someone forgets their current password, there is still no self-service recovery; the only fix is a human directly updating `password_hash` in the DB, or (for a non-critical account) deactivating and re-seeding. Not built — out of scope for what was asked (self-service change while already logged in), flagged as a natural follow-up.

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
- 🟢 **Live-send verification: comprehensive, all 4 email types, confirmed 2026-07-31.** Subject prefix, override redirect, correct body content (serial/amount/payee/remarks/etc.), NEFT-vs-Cash PDF-link gating, the no-email graceful fallback, and the Verified-email-fires-only-at-Verify timing were all confirmed live against the real Resend API with real message IDs — see the "Verified" entry above for full detail per test. Logo fix (squished aspect ratio, fixed 2026-07-30) not specifically re-confirmed visually this session, but the emails rendered and sent successfully throughout, consistent with the earlier fix holding.
- 🟡 **Resend's shared testing domain (`onboarding@resend.dev`) can ONLY deliver to the Resend account's own verified email address — confirmed 2026-07-30 by a real 403 from the API. No longer actively blocking anything as of 2026-08-05**, since Gmail SMTP is now the live provider (see the "Shipped" entry above) — this restriction only matters again once/if `EMAIL_PROVIDER` is switched back to `resend`. Still true, still worth knowing: as long as `EMAIL_FROM` stays on the shared `onboarding@resend.dev` domain, Resend can only ever deliver to the account owner's own inbox. Real delivery to anyone else via Resend requires `mcciapune.com` (or another owned domain) to be verified in the Resend dashboard first.
- 🟢 **"S H Kopardekar" / "SUDHANWA KOPARDEKAR" duplicate — resolved 2026-08-01.** Merged per the human's explicit confirmation they're the same person. "S H Kopardekar" row deleted after its single `staff_authority_options` reference was reassigned to SUDHANWA KOPARDEKAR (0 `payment_advices` ever referenced it). SUDHANWA KOPARDEKAR (with `sudhanwak@mcciapune.com`) is now the sole, canonical row. See the "Shipped" entry above for the transaction detail and live verification.
- 🟡 **No admin-facing visibility when an authority has no email and `notifyAuthorityApproval` silently falls back to preview — confirmed live 2026-07-31.** Checked the admin detail page's rendered HTML for a real no-email-authority submission: it shows a generic "Copy link to share with {authority}" button, identical to what's shown when the authority DOES have an email and WAS actually notified. Nothing distinguishes the two cases for Admin. Not fixed (more than a one-line change — needs the detail page's authority query extended to select `email` plus new conditional UI); flagged per the human's explicit instruction not to fix it silently.
- ⬜ **Resend `mcciapune.com` domain verification status is still unknown — deprioritized, not resolved, as of 2026-08-05.** No Resend account/dashboard access in any session so far; still haven't touched DNS or domain verification, per every prior session's instruction. This no longer blocks live email delivery *today* (Gmail SMTP does that now — see the "Shipped" entry above), but it's still what's needed before switching `EMAIL_PROVIDER` back to `resend` and getting mail to send from an official MCCIA domain instead of Gmail.
- 🟡 **Gmail SMTP's ~500-emails/day sending limit for a personal account — not a practical concern for this app's real volume (small internal Finance tool), and deliberately not coded around, per the brief.** Worth knowing if usage ever grows unexpectedly, or if something starts looping and sending repeatedly (nothing in this codebase currently does).
- 🟡 **Live mail now shows as coming from `mcciaexplore@gmail.com`, not an official MCCIA domain — an accepted, deliberate, interim trade-off (2026-08-05), not an oversight.** Every recipient (submitters, authorities) will see a Gmail sender address until `mcciapune.com` is DNS-verified in Resend and `EMAIL_PROVIDER` is switched back. No code change needed when that happens beyond flipping the env var + supplying `RESEND_API_KEY` again — the Resend path was kept fully intact for exactly this.
- 🟡 **`lib/staff-email.ts`'s `resolveStaffEmailByName()` has no live call site** — built and unit-tested per the brief's explicit request (resolve the 6 Verifier/Sanctioner names against the staff table), but nothing in this session's scope actually emails a verifier or sanctioner, so it isn't wired into any route. Likely forward-looking infrastructure; don't assume it's dead code to be deleted without checking with the human first.
- 🟢 **Task A (Vendor/Staff/Authority Edit + Deactivate) shipped and verified live 2026-07-31 by Claude Code** — see the "Shipped" entry above for the full audit findings (only Authority Edit was genuinely missing; staff email was never editable; a real dropdown-corruption bug was found and fixed) and the exact live verification performed against the real dev server + real Neon DB.
- 🟡 **`countInProgressForStaffName()`'s name-match safety check is best-effort, not exact** — `payment_advices` has no FK to `staff_members` at all, so deactivating a staff member whose submitted name doesn't textually match their canonical staff record (typo, nickname, maiden/married name change) will silently report 0 in-progress submissions even if they have some. This is a schema limitation, not a bug in the check itself — flagged in code and here rather than presented as reliable. Only a `staff_member_id` FK on `payment_advices` (a bigger, unrequested schema change) would make this exact.
- ⬜ **Task B audit (2026-07-31): "Received" and "In Process" are still one combined timestamp (`finance_received_at`), not two separate steps** — the human's own stated intended workflow describes them as distinct manual steps. Question asked directly, not decided: should this become two separate timestamps/tabs, or is the combined state fine for how Finance actually works day to day? **Blocking any schema change here until the human answers.**
- 🟢 **Rejected/sent-back visibility gap — fixed 2026-07-31.** A "Sent Back" tab now exists with a live count and a Remarks column; see the "Shipped" entry above. Verified live: a rejected submission correctly appears there with its remarks, and the existing 5 tabs' counts were confirmed unchanged by a live before/after check.
- 🟡 **General undo/reverse still does not exist — deliberately.** **Superseded 2026-08-01**: the narrow Verifier "Correct name" correction UI referenced here no longer exists (Verify is auto-attributed from the login session now, nothing to mis-pick) — see the "Real logins, retire Sanction" entry above. The Sanctioner correction UI still exists, but only ever applies to historical pre-cutover rows. If Admin needs to undo something (a wrong Received timestamp, un-verifying, un-marking Payment Done, or any other field), the only path is still the full Send Back → resubmit cycle (wipes authority approval, restarts the pipeline, re-notifies everyone). Not built; report-only.
- 🟢 **Cash Voucher independent numbering series shipped and verified live 2026-08-01.** `payment_advices.cash_voucher_no` + `serial_counters`'s new `(financial_year, series)` composite key — see the "Shipped" entry above for the full schema/allocation detail and the live-tested real submission (`CASH/MCCIA/2026-27/0003` printed correctly on the actual PDF, main `serial_no` unaffected).
- ⬜ **Undecided (needs human decision):** should `cash_voucher_no` be added as a new Excel export column for Cash-mode rows? Currently not exported (mirrors the already-declined "Expenditure Breakdown" column decision). Flagged, not added.
- 🟡 **`TEST_DATABASE_URL` is set in `.env.local` but empty** — the 4 new Cash Voucher series integration tests (and the 2 pre-existing main-series ones) are all `describe.skipIf(!testDbUrl)`-gated and skip in this environment, same as every prior session. If a scratch Postgres/Neon branch is ever pointed at by that var, these would start actually running — worth doing at some point to get real concurrent-allocation coverage on the new series, not just the pure `formatCashVoucherNo()` unit tests that do run today.
- 🟡 **Admin tab bar boxed/pill restyle (2026-08-01) verified via rendered HTML class-string inspection, not a visual screenshot or live click-through** — same browser-automation gap as every other UI-only change in this repo. Confirmed the active/inactive class strings are exactly as intended (see the "Shipped" entry above); a human should give it a quick visual glance to confirm it reads well.
- 🟢 **`scripts/seed-admin-users.ts` has been run — resolved.** Confirmed live 2026-08-01 (during login-failure debugging, see below): `admin_users` has exactly 3 real rows — `sunils@mcciapune.com` (PAYMENT_ADVICE), `abhak@mcciapune.com` (CASH_VOUCHER), `mcciaexplore@gmail.com` (ALL) — created within the same second, i.e. one real run of the script by the human, not by an agent. The earlier open item calling this blocking/unresolved is now stale.
- 🟢 **Login failure debugged and root-caused 2026-08-01, not a code bug.** The human reported "Incorrect email or password" for `sunils@mcciapune.com` despite using the password the seed script printed. Verified end-to-end: fetched the real stored `password_hash` from the dev DB, confirmed `bcrypt.compare()` against the exact password (given directly by the human in chat) returned `true`, and confirmed a real `POST /api/admin/login` with that same email/password over HTTP returned `200 OK`. Reviewed both the login route and `verifyPassword()` line-by-line — correct argument order, no double-hashing, no trim asymmetry. Root cause found by diffing the human's next paste byte-for-byte: it silently contained a trailing space + an invisible Unicode Word Joiner (U+2060) — 29 chars instead of 27 — most likely picked up copying out of `scripts/admin-users-report.md` in a non-plain-text viewer. Reproduced the exact failure by running `bcrypt.compare()` with the 29-char (junk-appended) string, confirmed `false`. No code changed; this was purely a clipboard/copy-source issue, told to the human with the exact fix (copy from a plain terminal `cat`, or strip the trailing chars after pasting).
- 🟡 **Dashboard-card interpretation (6 cards, not 7) is a judgment call, not something the human explicitly confirmed** — see the "Shipped" entry above for the reasoning (the brief's Part A literally lists "Verified" and "Ready for Payment" as two separate dashboard stages, but Part C makes clear they're the same derived condition). If the human actually wants both shown as distinct cards for some reason not evident in the brief, this needs revisiting.
- 🟢 **The dual-login feature has now also been live-verified with a real named account (Abha Khatavkar, `abhak@mcciapune.com`), not just throwaway test rows** — see the Cash Voucher display/labeling session's live verification above. Sunil's real account was also used directly (login-flow debugging above). The `ALL` account and Sunil's account still haven't been used to drive a full pipeline run end-to-end; low-priority since the code path is identical regardless of which real account exercises it.
- 🟡 **Amber stamp color (`#B8790C`, darkened from the UI's `#E8A33D`) for the Verified stamp was an agent judgment call, not human-picked** — the brief said "amber or navy — use your judgement," and navy was already used for Submitted, so amber was chosen for visual distinction between all three stamps. Darkened specifically for print legibility on white paper, confirmed by reading the actual rendered PDF. Flagging the exact hex in case the human wants an exact brand-amber match instead.
- ⬜ **No login exists for Chintamani (Sanction is now physical/offline) — explicitly out of scope per the brief, not an oversight.** If MCCIA ever wants Chintamani's physical sanctioning logged digitally, that's future work, not this session's.
- ⬜ **4 more surfaces found with the same "Payment Advice"/serial_no-regardless-of-mode inconsistency, flagged not fixed, per the human's explicit "ask me, don't fix silently" instruction — awaiting an answer:** (1) `lib/advice/authority-token.ts`'s already-actioned-link messages, (2) the Bill-Passed-For-save route's already-approved 409 message, (3) the invalid/expired-link generic error pages on `/authority-approval/[token]` and `/edit/[token]`, (4) the public intake form's "Submit Payment Advice"/"Resubmit" button and the confirmation screen's "Submit another Payment Advice" link. See the "Shipped" entry above for exact file/line detail on each.
- 🟢 **"Missing" `CASH/MCCIA/2026-27/0003` investigated and fully explained 2026-08-01 — expected, not a bug.** See the "Investigated" entry above for the complete reconciliation (all 5 numbers 0001–0005 accounted for) and the code-level proof that the two numbering series are independent. No code change.
- ⬜ **A genuine, real live production Cash submission (payee "AMAZON .IN", `serial_no MCCIA/2026-27/0036`, `cash_voucher_no CASH/MCCIA/2026-27/0004`, submitted 2026-08-01 13:50:56) was discovered sitting in the dev DB during the investigation above, mixed in among this engagement's own test data.** Not touched, not part of any test cleanup — flagging only because it's a reminder that this "dev" database has real, live MCCIA usage in it, not just test rows: any future test-data cleanup in this database must positively identify test rows (e.g. by payee name/email pattern used in that session) rather than assuming everything present is disposable.
- 🟢 **Stale authority-approval link investigated 2026-08-05 — expected, not a bug.** The human clicked an old link and got "This link is not valid." Confirmed via a real DB query: no `payment_advices` row has that token, and the advice it belonged to (id `6a5afff7-...`) plus its entire `audit_log` history no longer exist at all. Cross-referenced against this file's own 2026-08-05 Gmail SMTP verification entry, which explicitly notes test rows were deleted afterward — matches exactly (same advice id, same action sequence: approve → receive → verify → payment-done). `authority_token` is confirmed **not** single-use (stays live after approval, to render the approved/rejected banner) — "invalid" fires only when the token matches zero rows. No code change.
- 🟢 **Provider-level email send failures now write a distinct `EMAIL_SEND_FAILED` audit_log row, visible per-advice in the admin Audit Trail — shipped and live-verified 2026-08-05.** See the "Shipped" entry above. The "no email on file" case (`notifyAuthorityApproval`'s `!to` branch) was confirmed to remain a separate, unaffected code path — still just a console.warn + preview fallback, correctly never writes this new audit row.
- 🟢 **CLOSED SECURITY GAP (2026-08-06): `/authority-approval/[token]` no longer lets anyone with the link Approve/Send Back without confirming the authority's own email first.** See the "Shipped" entry above for the full risk writeup, the DB-backed (not in-memory) rate-limiting design, and the live verification (5 wrong attempts → 401 each + distinct audit rows → 6th attempt, even with the correct email, → 429; correct email on a fresh token → 200 + session cookie → reload shows Approve/Send Back with no re-prompt). This was true and unmitigated since the Approval Workflow shipped 2026-07-30 — flagging that history here for anyone auditing how long the gap existed, not just that it's fixed now.
- ⬜ **`recommending_authorities.email` being nullable was a real, live, active blocker for this identity gate — not just a theoretical edge case.** "DG" had no email on file until this session (now `dg@mcciapune.com`, set by the human directly). If a new authority is ever added without an email, that authority's real approvals will hard-block at the identity-confirm step (fails closed, `503`, by design) until an email is added — worth remembering the next time a new Recommending Authority is created via `/admin/staff`.
- 🟢 **Obsolete paper-form code `MCCIA/ACTT/PAD/013` removed from the app — 2026-08-06.** See the "Shipped" entry above for the full per-surface audit. Public form and Payment Advice PDF header fixed (PDF header's balance preserved via an invisible same-width spacer, not left with a gap); Cash Voucher PDF, admin detail page, authority-approval page, edit page, and all 5 emails confirmed to have never carried it. Still present in `README.md`/`SPEC.md`/this file's §1 as historical prose describing the old paper process — deliberately not touched, flagged for the human to decide.
- 🟢 **"Your Name"/"Your Email" vertical misalignment fixed structurally, 2026-08-06 — confirmed via git blame this was never previously fixed (one commit total on `Field.tsx`, the initial build), not a regression.** See the "Shipped" entry above. Pixel-measured before (22px off) and after (0px, exact) via a temporary Playwright install, not eyeballed.
- 🟢 **Real bug fixed 2026-08-06: a stale auto-filled "Your Email" never updated or cleared when the matched staff member changed on the public form.** See the "Shipped" entry above for the full root-cause (the old guard couldn't tell a stale auto-fill apart from a manual edit) and the fix (`resolveAutoFillEmail()` now takes a third `lastAutoFilledEmail` argument and returns a fill/clear/none action). Live-verified via a temporary Playwright install against real staff rows, including the previously-broken "switch to a different match" paths.
- 🟡 **`/api/staff/search` genuinely takes 0.5–1.9s round-trip in this dev environment** (observed directly via Playwright + `curl` timing during the session above) — not investigated further, not asked about, just noting it here since it's exactly the kind of latency that makes an impatient manual test of the typeahead *look* broken when it isn't. Worth knowing if the human (or a future agent) is ever debugging "the dropdown doesn't seem to show up" — give it a couple of seconds before concluding it's broken.
- 🟢 **Site icons restyled white/rounded-square 2026-08-06 (previously navy hard-edged square) — retroactively documented, see the "Shipped" entry above; this also closes the gap that the original 2026-08-05 icon session was never logged in this file at all.** `apple-touch-icon.png` deliberately stayed a plain opaque square with no rounding (confirmed correct per Apple's own convention, not assumed). Icon-only change — `app/layout.tsx`/`app/admin/layout.tsx`/`manifest.json` wiring untouched, confirmed via `git diff`.
- 🟢 **Basic/GST split + multi-part NEFT payment tracking shipped and live-verified end-to-end 2026-08-17 — Cash Voucher explicitly confirmed unaffected, not assumed.** See the "Shipped" entry above for full detail: schema, form, PDF, `payment_entries` route with race-safe capping, the two new money-safety guards (locked `bill_passed_for`, blocked Send Back once a payment exists), per-entry emails, and the mode-split admin tabs. Live-tested a real 2-part payment (Basic then GST) through the actual routes against the real dev server + real Neon DB + real Gmail SMTP.
- ⬜ **Undecided (needs human decision):** should Excel export gain new columns for `basic_amount`/`gst_amount`/`total_paid`, or a payment-entry count/latest-remarks column? Currently not exported — the existing `amount`/`status`/`approvedOn`/`approvedBy` columns already read correctly under the new model (confirmed, not assumed), so nothing is *broken* by leaving this out; flagged per the standing "ask before adding Excel columns" rule, same as the Approval Workflow/Cash Voucher/finance-pipeline columns before it.
- ⬜ **Undecided (needs human decision):** should the admin queue's `all` tab, or the per-advice detail page, show `total_paid`/remaining balance as its own sortable/filterable column for NEFT rows, beyond what's already visible on the detail page's "Record a Payment" panel? Not built — the brief's acceptance criteria were satisfied by the detail-page summary + history list; a queue-level column wasn't asked for.
- 🟡 **The new "Bill passed for Rs. is locked once a payment has been recorded" and "advice already has a payment recorded, can no longer be sent back" guards (2026-08-17) are judgment calls, not literally requested by the brief** — flagged explicitly in the "Shipped" entry above and here per the human's own "tell me what you find rather than patching around it silently" instruction. Both are scoped so Cash rows (which never have `payment_entries`) are provably unaffected (see the live-test section). If the human wants either behavior relaxed (e.g. allow editing `bill_passed_for` with a warning instead of a hard lock), that's a small, isolated change — both guards are single `if` blocks in their respective routes.
- 🟡 **`NAME_EMAIL_LIST`/`admin_users`-style per-person attribution for `payment_entries.paid_by` reuses the exact same snapshot-not-FK pattern as `verified_by`/`payment_done_by`/`sanctioned_by`** — a name string, not a real FK to `admin_users`. Same known limitation as those older fields: renaming/deactivating an admin user later never retroactively changes what's printed on a historical entry. Not new to this session, just noting it applies here too.
- 🟢 **Payment Advice PDF's "Recommended by" stamp fixed 2026-08-17 — corrected from "APPROVED" to "RECOMMENDED", matching the box's own label.** See the "Shipped" entry above for the fix and live verification against a real approved production row.
- ⬜ **Found, not fixed (2026-08-17, out of that session's explicit scope): `CashVoucherDocument.tsx`'s own "Recommended by" stamp has the identical "APPROVED" wording mismatch.** The Payment Advice PDF fix above did not touch it. Flagged, not silently extended — say the word if you want the same one-line correction there.
- 🟢 **Advance Payment feature shipped and live-verified end-to-end 2026-08-17 — both a NEFT-routed and a Cash-routed advance, plus explicit regression checks on regular (non-advance) submissions.** See the "Shipped" entry above for full detail: schema, the shared `ADVANCE` numbering series, `document-identity.ts` extension with a full 11-call-site audit (plus one pre-existing gap found and fixed), the public form's 3-way mode picker + Particulars/Purpose/Previous-Pending block, PDF extensions to both existing templates (no third template), and confirmation that the multi-part payment-capping logic needed zero code changes to work for advances.
- ⬜ **Undecided (needs human decision):** should Excel export gain columns for `is_advance`/`advance_no`/Particulars? Currently not exported, per the standing "ask before adding Excel columns" rule — same open question already pending for `basic_amount`/`gst_amount`/`total_paid` above.
- 🟡 **Settlement (reconciling actual spend against an advance afterward, returning/claiming balance) is explicitly not built** — out of scope per the brief. `previous_pending_advance_amount`/`_since` are purely self-declared by the submitter, never system-verified against anything, since no Settlement tracking exists to verify against. If/when Settlement is built, it's a separate future feature layered on top of this one, not a gap in this session's work.
- 🟡 **"Purpose of Advance" was kept as a distinct field from the itemized Particulars breakdown — a judgment call the brief explicitly invited pushback on, not silently decided.** See the "Shipped" entry above for the reasoning (Particulars = what by category; Purpose = why, real approval context). If this still feels redundant once you've used the real form, it's a small, isolated field to drop.
- 🟡 **`purposeOfAdvance` is mirrored into the existing `nature_of_expenditure` column, and the PDF/admin-detail "Nature of Expenditure" box relabels to "Purpose of Advance" for an advance rather than showing a second, separate box — a judgment call extending the "Bill Passed For → Amount Sanctioned" relabel precedent, not explicitly instructed.** Flagged in the "Shipped" entry above. If a genuinely separate Nature-of-Expenditure field is wanted for advances too (distinct from Purpose), that's a bigger, unrequested schema/UI change — ask first.

## 5. Do Not Touch Without Asking

- `lib/auth.ts` — admin JWT session logic. **As of 2026-08-01, split across 3 files, deliberately, not an accident to "clean up":** `lib/auth.ts` (Edge-safe — signs/verifies the JWT only, imported by `proxy.ts` which runs on the Edge runtime), `lib/admin-users.ts` (Node-only — bcrypt + DB lookups), `lib/admin-session.ts` (Node-only — reads the cookie via `next/headers` for Server Components/Route Handlers). Don't merge these back into one file; `next/headers`/`bcryptjs` in the Edge-loaded file would break the build or bloat the Edge bundle for no reason.
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
- **There is no `/api/admin/advice/[id]/approve` route anymore.** It was retired and folded into Sanction, which was itself later retired 2026-08-01 (see below) and folded into Payment Done. If you need "who approved this," that's `approved_by_name` — as of 2026-08-01 it's dual-written by `POST /api/admin/advice/[id]/payment-done`, not Sanction, for every new submission (pre-cutover rows may still have it from the old Sanction action; both mechanisms write the same field, never both on the same row).
- **Sanction is retired as an active pipeline step (2026-08-01) — replaced by automatic "Ready for Payment" + manual "Mark Payment Done."** `POST/PATCH /api/admin/advice/[id]/sanction`, `sanctioned_at`/`sanctioned_by`, `SANCTIONER_NAMES`/`sanctionSchema` all still exist in code and are **intentionally kept, not deleted** (historical data + the Sanctioner "Correct name" route for pre-cutover rows) — but nothing in the UI calls `POST .../sanction` anymore. Don't re-add a Sanction button/picker to the active flow without asking; use `POST .../payment-done` for any new terminal-action work.
- **`VERIFIER_NAMES` (4 people) in `lib/validation/payment-advice.ts` no longer gates the active Verify flow (2026-08-01)** — `verified_by` is auto-attributed from the logged-in `admin_users.full_name` (real per-person login), which is not guaranteed to be one of these 4 names. `VERIFIER_NAMES` is kept only because `PATCH .../verify` (the historical name-correction route) still uses it. `SANCTIONER_NAMES` (2 people) is unchanged/still hardcoded, same reasoning as always — not a CRUD-managed table, one-line code change if MCCIA adds/removes a Sanctioner.
- **The shared `ADMIN_PASSWORD` login no longer exists — removed entirely 2026-08-01, no fallback.** Real per-person logins (`admin_users` table, email + bcrypt password) replaced it completely. Don't reintroduce an `ADMIN_PASSWORD` env-var check "as a fallback" or "for convenience" — the human's explicit instruction was to remove the old check path entirely, not keep it dormant.
- **"Mark Payment Done" (`POST /api/admin/advice/[id]/payment-done`) is NOT backend-role-gated to `PAYMENT_ADVICE`/`CASH_VOUCHER`** — any signed-in `admin_users` session can call it for any submission regardless of payment mode, deliberately, per the same "default filter, not an authorization wall" decision that governs the landing-page filter default. Only the UI (`AdviceActions.tsx`) hides the button for a non-matching role. Don't add backend role enforcement here without checking with the human first — it would be a real behavior change, not a bug fix. **As of 2026-08-17, this route is Cash-only in practice** — nothing in the UI calls it for NEFT anymore (see below), though the route itself has no mode guard and would still technically succeed if called directly for a NEFT advice; not worth adding a guard for a path nothing reachable exercises.
- **NEFT's "Mark Payment Done" is retired (2026-08-17), replaced by multi-part "Record a Payment" (`payment_entries` table + `POST /api/admin/advice/[id]/payment-entries`) — Cash Voucher's single-action Payment Done flow is completely unaffected, still the exact same route/behavior/UI it always was.** See the "Shipped" entry (§3, 2026-08-17) for full detail. `payment_advices.payment_done_at`/`payment_done_by` are, going forward, Cash-only fields — NEFT never writes to them again (a fully-settled NEFT advice's terminal state is read from `payment_entries` + `total_paid` instead). Don't add a NEFT call site to `POST .../payment-done`, and don't read `payment_done_at`/`payment_done_by` as if they mean anything for a post-2026-08-17 NEFT advice — they'll just be null. The `payment_entries` cap is `bill_passed_for` minus prior entries, never the raw Basic+GST Total — confirmed with the human before building, since `bill_passed_for` already existed as exactly this ceiling concept. Don't change the cap basis without asking.
- **`payment_advices.bill_passed_for` becomes read-only/locked once ≥1 `payment_entries` row exists for that advice (2026-08-17, judgment call, not in the literal brief — see the Open Items entry above).** `PATCH /api/admin/advice/[id]/route.ts` 409s; `AdviceActions.tsx` renders it as plain text instead of an editable input in that state. Cash rows never trigger this (they never have `payment_entries`). Don't relax this without asking — it exists specifically so the cap Finance's recorded payments were measured against can't silently change out from under them.
- **`POST /api/admin/advice/[id]/send-back` now also 409s once ≥1 `payment_entries` row exists for that advice (2026-08-17, judgment call, not in the literal brief — see the Open Items entry above), in addition to the pre-existing "already APPROVED" 409.** Reasoning: NEFT's partial-payment model can leave real money already disbursed while `status` is still `SUBMITTED` (only the *final* entry flips it to `APPROVED`), so sending such an advice back would let the submitter change bill details a real disbursement already happened against. Cash rows never trigger this. Don't relax this without asking.
- **`payment_advices.total_paid` is the load-bearing signal the admin tabs use to tell a Cash-paid row and an NEFT-paid row apart (2026-08-17)** — Cash's "Mark Payment Done" never writes to it, so it stays `"0.00"` forever for Cash rows; this is what lets `lib/admin/filters.ts`'s `payment_done` tab condition (`status = 'APPROVED' AND payment_mode = 'CASH'`) and `fully_payment_settled` (`status = 'APPROVED' AND payment_mode = 'NEFT'`) stay correctly split even though both are reached via the same `status` transition. Don't write to `total_paid` from anywhere outside the `payment_entries` insert transaction in `POST .../payment-entries`.
- **`lib/pdf/Stamp.tsx`'s stamps are positioned `bottom-right` inside each signature cell, not `top-right`** — top-right was tried first and visually collided with the existing name/label text (confirmed by rendering and reading the actual PDF, not just inspecting JSX). If repositioning, re-render and actually read the output before assuming a CSS change looks fine.
- **`sanctioned_by_name` (submitter-filled) no longer exists — don't confuse it with `sanctioned_by` (admin-recorded) or `verified_by_name` (submitter-filled, PDF footer) vs `verified_by` (admin-recorded, Finance pipeline).** The submitter-filled/admin-recorded pairs look similar but are unrelated concepts that happen to both end up printed near each other on the PDFs. See the Finance pipeline entry above.
- **The Payment Advice PDF (`/api/advice/[id]/pdf`, `/api/admin/advice/[id]/pdf`) 404s for every Cash submission, at every status, no exceptions.** Don't add a code path that serves it for Cash even conditionally (e.g. "for Admin only," "once approved") — the human's instruction was Cash never gets this PDF, full stop. Only the Cash Payment Voucher exists for Cash.
- **`EMAIL_FROM` only applies when `EMAIL_PROVIDER=resend`, and must stay `onboarding@resend.dev` (the Resend shared testing domain) until the human confirms `mcciapune.com` is DNS-verified in the Resend dashboard.** Don't switch it to a `mcciapune.com` address, and don't touch DNS/attempt domain verification — explicit human instruction, and outside what an agent can even do (needs their IT team).
- **`EMAIL_MODE` must default to `"preview"` for anything other than exactly the string `"live"` — this is deliberate and load-bearing, not a bug.** It's what keeps every environment (including any that forgets to set the var) behaving exactly as it did before Resend was wired up. Don't change the comparison to be more permissive (e.g. truthy-check) without asking.
- **`EMAIL_PROVIDER` must default to `"gmail"` for anything other than exactly the string `"resend"` (2026-08-05) — this mirrors `EMAIL_MODE`'s "explicit opt-in, safe default" pattern.** Gmail is the current live provider; don't flip the default to `resend` without asking (Resend still can't deliver to anyone but the account owner until `mcciapune.com` is DNS-verified — flipping the default without that would silently break live delivery). The Resend code path (`getResendClient()`, the `resend` branch in `dispatch()`/`getFrom()`) must stay intact, not deleted, even while dormant.
- **For the `gmail` provider, `getFrom()` always returns `GMAIL_USER`, ignoring `EMAIL_FROM` entirely — this is a hard Gmail SMTP requirement (the authenticated account and the `from` header must match), not a bug or an oversight to "fix" by wiring `EMAIL_FROM` in too.** Don't try to send "as" a different address through the gmail provider.
- **`notifyAuthorityApproval()`'s `to` parameter is `string | null`, not `string` like the other three notify functions** — deliberately, since ~2/13 recommending authorities have no email on file and must silently fall back to preview (never throw, never block the calling route) rather than erroring. Don't change its signature to require a non-null email.
- **`lib/staff-authority-emails.ts`'s `NAME_EMAIL_LIST` is the single authoritative source for staff/authority emails** — `scripts/backfill-staff-authority-emails.ts` and `lib/staff-email.ts` both import from it rather than duplicating the list or the name-normalization logic. If MCCIA sends an updated email list, edit this one file and re-run the backfill script; don't hand-edit DB rows or create a second list.
- **Never assume the `vi.mock`/`vi.fn().mockImplementation()` pattern for mocking a class constructor is broken across a whole test file just because one test fails and the same test passes in isolation — check `afterEach`/`beforeEach` for `vi.restoreAllMocks()` first.** It silently strips `mockImplementation` from plain `vi.fn()`s (not just spy state, despite the name), which only manifests as failures once 2+ tests share the mock. Cost real time to root-cause in this session (see the session log entry below) — don't rediscover it the hard way again.
- **Recommending Authorities are managed inline on `/admin/staff` (`components/admin/AuthoritiesSection.tsx`), not a standalone `/admin/authorities/[id]` page** — this is a deliberate continuation of the earlier Staff/Authority Roster session's "one page" consolidation. Don't reintroduce a separate authorities page without checking; extend `AuthoritiesSection`'s inline create/edit form instead.
- **The deactivation safety check (staff + authorities, `lib/advice/deactivation-safety.ts`) is NOT a hard block — it's a warn-then-confirm gate.** `PATCH` returns 409 with `{error, inProgressCount}` when deactivating something with in-progress dependents and no `force: true` in the body; the UI shows `window.confirm()` and retries with `force: true` if the admin agrees. Don't change this to a hard block (the human explicitly wants "confirm and continue if they choose," not "cannot deactivate") and don't remove the `force` escape hatch.
- **`countInProgressForStaffName()` matches by name, not FK** (`payment_advices` has no `staff_member_id` column) — it is a best-effort approximation, not a reliable reference check. Don't present its result as exact, and don't "fix" it by adding fuzzy matching without asking — the human may want a real FK instead, which is a bigger schema change.
- **The Verifier/Sanctioner "Correct name" action is a narrow name-only fix, not undo/reverse — don't extend it into general undo without asking.** It exists as `PATCH` on the same `verify`/`sanction` route files that already have `POST` (not new route paths) — keep that pattern if extending it. `PATCH .../sanction` deliberately also updates `approved_by_name` alongside `sanctioned_by` (flagged in the Shipped entry above) since it's a dual-write mirror of the same fact; `PATCH .../verify` has no equivalent second field to sync. Neither PATCH ever touches `verified_at`/`sanctioned_at`/`status`/`bill_passed_for` — don't add that without asking, it would turn a name fix into an undo.
- **The "Sent Back" tab's Remarks column reads `admin_remarks`, not `authority_remarks`.** `admin_remarks` is always set by `performSendBack()` regardless of who triggered it (Admin or the Authority); `authority_remarks` is only set for authority rejections specifically and would be blank for Admin-initiated send-backs. Don't switch the column to `authority_remarks` — it would silently go blank for half the rows.
- **"S H Kopardekar" no longer exists as a `recommending_authorities` row — merged into "SUDHANWA KOPARDEKAR" 2026-08-01.** Don't recreate a "S H Kopardekar" row; if the human ever mentions that name again, it means SUDHANWA KOPARDEKAR (`sudhanwak@mcciapune.com`).
- **`payment_advices.cash_voucher_no` is a separate, independent number from `serial_no` — never conflate or repoint one reader at the other.** `serial_no` (format `MCCIA/<FY>/NNNN`) stays the DB/audit-log/Excel identifier for every submission regardless of mode; `cash_voucher_no` (format `CASH/MCCIA/<FY>/NNNN`) exists only for Cash-mode submissions and is purely what prints on the Cash Voucher PDF's "No." field. Excel export deliberately does not include `cash_voucher_no` — see the open item above; don't add it without asking.
- **`serial_counters` now has a composite primary key `(financial_year, series)`, not just `financial_year`.** `series` is `'PAYMENT_ADVICE'`, `'CASH_VOUCHER'`, or (as of 2026-08-17) `'ADVANCE'` — all three allocated through the exact same `allocateNumber()` gapless `SELECT ... FOR UPDATE` primitive in `lib/serial.ts` (still covered by the existing "don't touch `lib/serial.ts`" rule above). A fourth series fits the same composite-key shape trivially (confirmed before adding the third) — but don't add one without checking first anyway, and don't collapse any of the three back into a shared counter — they must stay independently gapless per-FY. **`ADVANCE` is deliberately one shared counter regardless of NEFT/Cash sub-route — don't split it into two.**
- **`lib/advice/document-identity.ts` (`documentLabelFor()`/`displayNoFor()`/`billPassedForLabelFor()`) is now the single source of truth for "what do we call this submission, what number do we show as primary, and what do we call the sanctioned-amount field."** Every server-rendered page and every email call site uses it (2026-08-01 session; extended 2026-08-17 with an `isAdvance`/`advanceNo` parameter pair on the first two, both defaulting to `false`/`null` so every pre-existing call site kept compiling unchanged, plus the new third function). Don't hardcode "Payment Advice"/`serial_no` in a new surface, or reimplement the NEFT/CASH/Advance branching inline — that's exactly the class of bug this file exists to prevent from recurring. If you add a new user-facing surface that names the document type, shows its reference number, or shows the sanctioned-amount field, use these three functions. **`documentLabelFor(mode, true)` is not "Advance " + the base label mechanically** — the Cash case is "Advance Cash Voucher," dropping "Payment," not "Advance Cash Payment Voucher."
- **`payment_advices.payment_mode` never gained a third value for Advance Payment (2026-08-17) — it's still exactly `'NEFT'` | `'CASH'`.** Advance is a wholly separate `is_advance` boolean layered on top; an advance still routes through the identical NEFT or Cash pipeline/dashboard/tabs/PDF-route-gating as a regular submission. This is deliberate and load-bearing — it's what let this feature ship without touching any of the many pre-existing `paymentMode === "CASH"`/`"NEFT"` branches across the codebase. Don't add a third `payment_mode` value; branch on `is_advance` instead, additively, the way every surface listed in the 2026-08-17 "Shipped" entry already does.
- **Advance Payment's Particulars breakdown (`advance_particulars`) and Cash Voucher's line items (`cash_voucher_items`) are mutually exclusive per row — never both populated for the same advice.** A Cash-routed advance uses `advance_particulars`, not `cash_voucher_items` (which stays empty for it); a NEFT-routed advance also never touches `cash_voucher_items` (which only NEFT-never-used anyway). Same mutual-exclusivity discipline as the pre-existing Basic/GST-vs-Cash-items split — don't populate both for one row.
- **`lib/email/notify.ts`'s `send()` and all 5 `notify*()` functions now take an optional trailing `adviceId` param (2026-08-05), used only to write an `EMAIL_SEND_FAILED` audit_log row on a real provider failure.** It's optional, not required — a caller without a real advice id in scope (there are none today, but a future one might exist) can simply omit it; the send still happens and still fails safely, just without that audit row. Don't confuse `EMAIL_SEND_FAILED` with the benign "no email on file" case — that one is `notifyAuthorityApproval`'s `!to` branch, which never reaches `send()` and by design never writes this row. If you add a 6th `notify*()` function, thread `adviceId` through it the same way for consistency.
- **The authority-approval identity gate (2026-08-06) is deliberately not a login system — don't turn it into one.** `/authority-approval/[token]` requires confirming the authority's own email (scoped to that specific advice's `recommendingAuthorityId`, never a global lookup) before Approve/Send Back show. The rate limiter is intentionally DB-backed (counts recent `AUTHORITY_IDENTITY_CHECK_FAILED` audit_log rows), not an in-memory map like the admin login route's — don't "simplify" it back to a Map, that would reintroduce the exact per-instance/cold-start weakness the login route's own comment already flags. The per-token session cookie (`mccia_authority_identity_{token}`) deliberately has no `Max-Age`/`Expires` — don't add persistence beyond "this browser session" without asking. Don't extend this same gate to `/edit/[token]` without being asked — explicitly out of scope this session.

## 6. Session Log

Append one entry per session, newest at the top. Keep entries short — this is a changelog, not a diary.
(Note: this header was accidentally dropped in an earlier edit and restored 2026-08-01 by Claude Code — no content was lost, only the heading line.)

```
2026-09-04 — Codex — Applied the explicitly confirmed lowercase-first-name +
@2026 passwords to the 8 Authority expansion accounts, hashing all values with
the existing bcrypt helper and updating them in one transaction after a local
gitignored hash backup. All 8 final hashes verified. Ganesh live-login showed
normal dashboard access/no forced redirect; voluntary Change Password worked,
and the approved initial password was restored and re-verified. Seed behavior
now preserves this deliberate distribution rule for future creation. tsc,
ESLint, 305 tests (7 skipped), and production build clean.

2026-09-04 — Codex — Recomputed, but did not apply, the Authority expansion
batch's predictable passwords after the human revised the rule from full name
to lowercase first name + @2026. Seven personal names are unambiguous; DG has
no first name, so the displayed final list explicitly proposes literal dg and
awaits confirmation. No live passwords or accounts were changed.

2026-09-03 — Codex — Prepared, but did not apply, the requested predictable
password pattern for the eight newly added Authority accounts. Confirmed the
prior audit is final: DG included, AI Studio excluded, engineer@ confirmed for
Rajnikant. All names reduce unambiguously via lowercase + remove every space +
@2026 (including Rajnikant's doubled DB whitespace). Awaiting explicit approval
of the displayed eight-password list before resetting any stored hashes.

2026-09-03 — Codex — Completed the confirmed Authority Dashboard expansion.
Extended the guarded idempotent seed and created 8 accounts: DG, Ganesh Mate,
MANGESH KULKARNI, Neeraj Thakur, Nikhil Jain, RAJNIKANT  GAIKWAD, SUDHANWA
KOPARDEKAR, and Satavisha Natu. Production now has 12 active, uniquely linked
AUTHORITY accounts; inactive AI Studio remains excluded. The seed skipped all
7 existing accounts unchanged. Live logins passed for Ganesh and Nikhil; both
saw only their empty queues and could not see real 0001 assigned to Chintamani.
No test submission was created. tsc, ESLint, 305 tests (7 skipped), build clean.

2026-09-03 — Codex — Completed Step 1 of the requested Authority Dashboard
account expansion as a read-only production audit. Found 13 authority rows:
the original 4 active AUTHORITY accounts, exact inactive AI Studio exclusion,
and 8 active rows without accounts. No authority lacks an email. Awaiting the
human's explicit DG decision and confirmation of Rajnikant Gaikwad's role-style
engineer@ email before changing or running the seed; no accounts were created.

2026-09-03 — Codex — Diagnosed Shantanu's failed Authority login read-only.
The production admin_users row exists, is active, has AUTHORITY role, and is
linked to SHANTANU JAGTAP; the locally retained generated credential matches
its stored bcrypt hash. The screenshot's typed password omitted its leading
hyphen and used lowercase k where the generated credential has uppercase K.
No account or production data was changed. Recommended rotating the exposed
password after login.

2026-09-03 — Codex — Audited Required/Optional UI labels against the shared
client/server schema and server attachment validation across standard NEFT,
Cash Voucher, and Advance. Confirmed source and deployed P.O. Date are
Optional; added regression tests for blank and malformed values. No live
submission was made, preserving 0001. tsc, ESLint, 305 tests (7 skipped),
and production build clean.

2026-09-03 — Codex — Verified the human-executed deliberate pre-launch data
reset: all 6 submission/audit tables empty, Blob store empty, all three
2026-27 counters at 0, and preserved counts exactly unchanged (7 admins, 660
vendors, 51 staff, 59 mappings, 13 authorities). Backup/checksums retained in
the gitignored .local-backups directory. Ran only non-mutating route checks;
no submission consumed 0001. tsc, ESLint, 303 tests (7 skipped), build clean.

2026-09-03 — Codex — Anchored the shared public Login menu to the header's
top-right on desktop and reserved title space so long copy cannot push it
onto a second row; mobile keeps natural wrapping. tsc and ESLint clean.

2026-09-03 — Codex — Added a shared top-right Login dropdown to both public
request forms, linking Finance Admin Login to /admin/login and Authority Login
to /authority/login; their existing successful-login redirects remain /admin
and /authority. Rendered Login control and both 200 routes verified; browser
connection unavailable for visual clicking. tsc, ESLint, 303 tests (7 skipped),
and build clean.

2026-09-03 — Codex — Split Finance home into analytics Dashboard at /admin
and the unchanged working queue at /admin/submissions. Moved role-scoped stage
cards to Dashboard and added 90-day weekly volume, payment-type breakdown,
top vendors, authority wait time, and current-FY financial totals. Shared one
role-scope helper with Submissions; updated nav/logo/detail fallback. Live-
rendered ALL and PAYMENT_ADVICE logins and deleted both temporary accounts.
tsc, ESLint, 303 tests (7 skipped), and build clean.

2026-09-03 — Codex — Replaced Authority Pending's inline decision controls
with View and added the authority-scoped full submission detail page. History
also links to the same read-only detail; pending detail reuses the existing
AuthorityQueueActions and APIs. All attachment types are viewable through the
session/authority-scoped route. Live-tested View → full detail → approve →
History/read-only plus an OTHER PDF download; all temporary DB/Blob data
deleted. tsc, ESLint, 300 tests (7 skipped), and build clean.

2026-09-03 — Codex — Added the existing history-aware “← Back to Dashboard”
link to the shared Change Password page wrapper. Finance supplies `/admin` as
its direct-entry fallback; Authority supplies `/authority`, whose default is
Pending My Approval. tsc, ESLint, 300 tests (7 skipped), and build clean.
Authenticated click-through remains unclaimed: no browser session was
connected and the environment refused impersonation-session minting.

2026-09-03 — Codex — Centered the entire Change Password content column
(heading, description, shared form) with mx-auto/w-full/max-w-sm. Added one
shared ChangePasswordPageContent wrapper used by both Finance Admin and
Authority routes rather than duplicating the layout fix. Authenticated live
HTML confirmed the centered wrapper; browser connection unavailable, so no
visual screenshot claim. tsc, ESLint, and 300 tests (7 skipped) clean.

2026-09-03 — Codex — Added the read-only Authority dashboard My Submissions
tab, exactly scoped by payment_advices.submitted_by_email = the current
admin_users.email loaded from DB. Shows shared document identity, full
derived pipeline stage, date/amount/payee, and retained send-back remarks;
never renders approval actions or duplicates edit-token resubmission. Added
8 pipeline-stage tests. Live-tested a real API submission under Aniruddha's
official email: visible only to Aniruddha, absent for Chintamani, correct
Waiting on Authority stage, zero action controls. Temporary advice/audit/
Blob files deleted. tsc, ESLint, 300 tests (7 skipped), and build clean.

2026-09-03 — Codex — Made Enclosures and Special Remarks required only
for standard NEFT Payment Advice submissions. UI labels use the shared red
Required style under exactly the same condition; the shared Zod schema
enforces trimmed non-empty values on both client and server. Focused tests
confirm standard Cash and /advance remain optional. Live-rendered / and
/advance labels confirmed; local API attempts returned each clear NEFT
validation error without persisting data. Browser-control unavailable, so
clicked UI interaction not claimed. tsc, ESLint, 292 tests (7 skipped),
and build clean.

2026-09-03 — Claude Code — Added self-service Change Password for any
admin_users account (Finance or Authority, any role). New shared route
POST /api/account/change-password, authorized in proxy.ts by "any valid
session" (new /api/account/* branch, added without touching the existing
Finance/Authority routing Codex wrote the same day). bcrypt-verifies the
current password, requires 8+ chars, confirmation match, and different-
from-current, all via one shared Zod schema. Writes ADMIN_PASSWORD_CHANGED
to audit_log with no password material; session stays valid after a
change. New AccountMenu dropdown in both the Finance Admin and Authority
headers. Found Codex's Authority-dashboard feature as live, uncommitted,
undocumented WIP mid-session; confirmed with the human it was Codex
actively finishing before building on top of it, per §0 rule 7 (parallel-
agent conflict). Live-verified end-to-end against the real dev server +
real Neon DB with a throwaway test account: every validation guard,
session-stays-valid-after-change, old-password-401s/new-password-200s
after logout, and the exact audit_log row content (test account deleted
after). Did not touch lib/auth.ts, schema.ts, migrations, or the seed
script. tsc, ESLint, 287 tests (7 pre-existing skipped), and build clean.

2026-09-03 — Codex — Added an accessible Show password checkbox to both
Finance Admin and Authority login forms. It toggles only the input display
type and leaves credential handling/authentication unchanged. tsc, ESLint,
and diff checks clean.

2026-09-03 — Codex — Fixed the combined Finance+Authority seed after its
first real run stopped at Sunil's expected duplicate email. It now preflights
all requested emails, safely skips exact matching active accounts without
changing or reprinting their passwords, and still refuses any conflicting
name/role/authority-link state. No Authority rows were created by the failed
run because Sunil was first. tsc, ESLint, and diff check clean; seed not
re-run by Codex so the generated passwords remain in the human's own console.

2026-09-03 — Codex — Added AUTHORITY-role admin_users linked by FK to
recommending_authorities, a separate /authority/login, strictly scoped
Pending + read-only History dashboard, scoped attachment access, and
Approve/Send Back actions. Extracted the underlying authority decision
logic so both authenticated and existing token-link routes call the same
functions; old token route and email-confirmation gate remain intact.
Migration 0014 applied. Exact live name matches confirmed for all four;
seed entries remain TODO-email-blocked and were not run. Live-tested two
temporary accounts for cross-visibility, approved real pending submission
MCCIA/2026-27/0046 as Aniruddha, confirmed Pending→History and the old token
URL's already-approved view, then deleted temporary accounts. tsc, lint,
279 tests (7 pre-existing skipped), and build clean.

2026-08-17 — Claude Code — Shipped Advance Payment: a third top-level
Payment Mode option (NEFT / Cash / Advance Payment) that routes through
the existing NEFT/Cash pipelines exactly unchanged, flagged via a new
is_advance boolean rather than a fourth payment_mode value — this
design choice is what let the whole feature ship without touching any
pre-existing paymentMode branching. New own numbering series (ADV/
MCCIA/<FY>/NNNN via lib/serial.ts's allocateAdvanceNumber, one shared
counter regardless of NEFT/Cash sub-route, live-confirmed). New table
advance_particulars (6 preset categories + Others-please-specify) plus
purpose_of_advance/previous_pending_advance_* columns. document-
identity.ts extended with isAdvance/advanceNo params (both default to
false/null, zero breakage) plus a new billPassedForLabelFor() helper
("Amount Sanctioned" for advances) — audited and fixed all 11 real
call sites across routes/pages/emails, plus found and fixed one pre-
existing gap (the public confirmation screen never used this helper
at all, predating it). Public form gained a full Particulars/Purpose-
of-Advance/Previous-Pending-Advance block, hides Basic/GST and cash
line items and Tax Invoice's requirement when isAdvance. Both existing
PDF templates extended conditionally (not a third template) — Payment
Advice PDF gained a Particulars table + Previous Pending line + the
Nature-of-Expenditure box relabels to Purpose of Advance (judgment
call, flagged, extends the existing Bill-Passed-For relabel
precedent); Cash Voucher PDF's existing items table is reused, fed
from advance_particulars instead of cash_voucher_items for a Cash-
advance. Confirmed via exhaustive grep, not assumed, that the prior
session's multi-part-payment-capping logic needed zero changes to
work for advances (it never referenced basicAmount/gstAmount, only
the generic amount/bill_passed_for). Live-verified end-to-end: a real
NEFT-advance (paid in two parts, same payment_entries route, isFinal
correctly false then true) and a real Cash-advance (old payment-done
route still works unchanged, payment-entries correctly refuses it),
correct tab placement with zero leakage either direction, correct PDF
rendering for both, zero EMAIL_SEND_FAILED rows. Explicitly regression-
tested plain NEFT/Cash submissions afterward — Tax Invoice still
required, PDFs render with zero visual change. tsc/ESLint/Vitest (252
passing)/next build all clean. All test data + Blob uploads deleted
afterward.
2026-08-17 — Claude Code — Fixed the Payment Advice PDF's "Recommended
by" signature-box stamp, which read "APPROVED" (inconsistent with its
own label) — now reads "RECOMMENDED", matching "Submitted by"/
"SUBMITTED" and "Verified by"/"VERIFIED". One-line change in
lib/pdf/PaymentAdviceDocument.tsx; condition/name/date/color all
unchanged. Confirmed the longer word still fits the stamp's fixed-
width box by actually rendering, not assumed. Found but deliberately
did not fix the identical mismatch in CashVoucherDocument.tsx (out of
this session's scope, flagged as an open item). Live-verified by
downloading the real PDF for an existing approved production
submission (MCCIA/2026-27/0042) via the real admin route, read-only.
tsc/ESLint/Vitest/next build all clean.
2026-08-17 — Claude Code — Added a "← Back" link (new shared BackLink
component, router.back()-based) to every admin sub-page one level deep
from a list view: advice detail ("Back to Submissions"), vendor
edit/new ("Back to Vendors"), staff/authority edit/new ("Back to Staff
& Authorities"). Audited all 9 app/admin page.tsx files first — the
list pages themselves (Submissions, Vendors, Staff & Authorities,
already reachable via the persistent header nav) and the login page
correctly got no link. Uses real browser history, not a hardcoded
href, specifically so whatever tab/filter state was active on the
Submissions list survives a round trip through a detail page — live-
verified via a temporary Playwright install (uninstalled after,
package.json/lock diff confirmed empty): applied a Payee filter,
opened a detail page, clicked Back, confirmed the exact same filtered
URL and input value came back, not a reset /admin. tsc/ESLint/Vitest/
next build all clean.
2026-08-17 — Claude Code — Basic Amount + GST Amount split (NEFT only,
replacing the single "Amount (Rs.)" field, with a live-computed read-only
Total) plus a new payment_entries table + "Record a Payment" multi-part
payment model, also NEFT only, retiring the old single-action "Mark
Payment Done" for NEFT (Cash Voucher's Payment Done flow is completely
unchanged, verified explicitly). New migration 0010: basic_amount/
gst_amount/total_paid on payment_advices, new payment_entries table. New
route POST /api/admin/advice/[id]/payment-entries, race-safe via a real
SELECT...FOR UPDATE row lock, caps against bill_passed_for minus prior
entries (confirmed with the human this is the right basis before
building). The entry that completes the total dual-writes status/
approved_at/approved_by_name exactly as the old Payment Done action did;
partial entries never touch those fields. Two money-safety guards added
beyond the literal brief, flagged rather than silent: bill_passed_for
locks once a payment is recorded, and Send Back is blocked once a payment
is recorded. New per-entry email (renderPaymentEntryEmail/
notifyPaymentEntry) clearly labeled partial vs. final, never a cumulative
summary. Admin tabs split: old "payment_done" tab now Cash-only-scoped,
two new NEFT-only tabs (partial_payment_done, fully_payment_settled).
Payment Advice PDF shows a 3-line Basic/GST/Total breakdown for new
submissions, falls back to the old single line for pre-split rows. Excel
export deliberately untouched (flagged, not added). tsc/ESLint/Vitest
(229 passing, 6 pre-existing skipped)/next build all clean. Live-verified
end-to-end against the real dev server + real Neon DB + real Gmail SMTP:
a real NEFT advice paid in two parts (Basic then GST), all three new
guards fired correctly, correct tab placement at each stage, correct
dual-write only on the final entry, zero EMAIL_SEND_FAILED rows (both
emails sent for real), PDF and admin detail page rendered correctly. A
separate real Cash advice run through the identical pipeline confirmed
byte-for-byte unaffected: old payment-done route still 200s, payment-
entries route 409s for it, total_paid/basic_amount/gst_amount all stayed
null/zero, and it landed only in the Cash-scoped tab with zero leakage
into the new NEFT tabs (and vice versa). All test data (2 advices, 4 Blob
attachments, 1 throwaway admin_users login) deleted afterward.
2026-08-06 — Claude Code — Restyled the 4 app icon files (icon-192.png,
icon-512.png, apple-touch-icon.png, favicon.ico) from navy hard-edged
square to white rounded-square, per the human's request. Regenerated from
public/mccia-logo.png (trimmed to its real content bbox), white RGBA
background with a real rounded-rect + transparent corners (~21% radius,
confirmed via a direct corner-pixel alpha check and by compositing onto a
dark background to make the transparency visible, not just trusted from
the generation code). apple-touch-icon.png deliberately kept as a plain
opaque RGB square, no rounding -- this is Apple's own documented
convention (iOS applies its own mask; a pre-rounded/transparent source
double-rounds), confirmed correct before shipping it that way rather than
assumed. favicon.ico got the same rounded treatment at all 3 embedded
sizes; 16px legibility is still poor regardless of shape/background, same
known limitation flagged in the original icon session, not new. Pure
asset regeneration -- confirmed via git diff that layout.tsx/admin
layout.tsx/manifest.json wiring is completely untouched, and re-checked
live against the dev server that both sections' rendered <head> and every
icon URL still serve correctly. Also retroactively logged the ORIGINAL
icon setup in this file's Shipped section -- it shipped 2026-08-05 but
was never actually written up here, a real gap, now closed. tsc and
ESLint clean (no code changed, so no test/build re-run needed beyond
that).
2026-08-06 — Claude Code — Fixed two public-form bugs in Section 1
"Submitter details". (1) "Your Name"/"Your Email" vertical misalignment:
Field.tsx's helper-text <p> was conditionally rendered, so a field with
help copy (Name) started its input lower than one without (Email). git
blame showed Field.tsx has exactly one commit ever (the initial build) --
never fixed before, not a regression. Fixed structurally in the shared
component (always render the <p>, invisible NBSP fallback when no help
text) rather than a margin hack, so it can't drift again and fixes every
other two-column field pairing with the same latent issue too. (2) Email
auto-fill: the brief assumed this was never wired up, but it already was
(committed on main). The real bug, found via live testing: switching the
Name field to a DIFFERENT matched staff member never updated/cleared a
previously auto-filled email -- the old guard couldn't tell "stale
auto-fill, safe to replace" apart from "real manual edit, never touch."
Fixed by having resolveAutoFillEmail() track what it itself last wrote
(3rd arg, lastAutoFilledEmail) and return a fill/clear/none action;
PaymentAdviceForm.tsx now mirrors RecommendingAuthorityField's existing
lastStaffId-ref "only react on an actual identity change" pattern.
Neither bug could be honestly verified without real rendering/interaction
-- no browser automation was available in this environment (documented
gap all session), so with the human's explicit approval, installed
Playwright + headless Chromium as a TEMPORARY devDependency, used it to
pixel-measure both inputs (22px off -> 0px after) and drive the actual
typeahead against real staff rows (one with an email, one without, one
with no match, and two-different-matches-both-with-emails to prove the
update path, not just clear), then fully uninstalled it afterward --
git diff on package.json/package-lock.json shows zero trace left. Also
discovered /api/staff/search genuinely takes 0.5-1.9s round-trip in this
dev environment (Neon latency, not a bug) -- explains why a quick manual
test could look broken when it isn't; noted as an open item. tsc, ESLint,
full Vitest suite (192 passed, 6 pre-existing skipped), and next build
all clean.
2026-08-06 — Claude Code — Removed the obsolete old-paper-form code
MCCIA/ACTT/PAD/013 (no longer meaningful now the app has its own
MCCIA/<FY>/NNNN and CASH/MCCIA/<FY>/NNNN numbering). Exhaustive grep
(case-insensitive, "ACTT" and "PAD[ /_-]*013") found exactly 5
occurrences codebase-wide: app/page.tsx (public form eyebrow text,
removed clean, H1 becomes first line), lib/pdf/PaymentAdviceDocument.tsx
(PDF header, top-right, removed but kept the same 92pt-wide element as an
invisible spacer so the centered institutional title stays balanced
against the logo -- confirmed by rendering and visually inspecting the
PDF, not left with a gap), plus README.md/SPEC.md/this file's own §1
(historical prose describing the old paper process -- left untouched,
flagged for the human, out of the brief's stated scope). Verified, not
assumed, that Cash Voucher PDF never had it (its masthead is a 2-part
[logo][centered heading] layout, never had a 3rd right-side element to
begin with) and that the admin detail page, authority-approval page, edit
page, and all 5 emails never carried it either. Also checked the logo PNG
itself isn't hiding it baked into pixels -- it isn't. Live-tested: fresh
Payment Advice + Cash Voucher PDFs rendered and visually inspected (header
crops), public form loaded from the real dev server and confirmed clean
in the actual rendered HTML. tsc, ESLint, full Vitest suite (187 passed,
6 pre-existing skipped -- text/layout-only change, no new tests needed),
and next build all clean.

2026-08-06 — Claude Code — Closed a real security gap on
/authority-approval/[token]: the link's unguessable token was the ONLY
protection on Approve/Send Back, and it's distributed by a single email —
if forwarded or an inbox compromised, anyone with the link could approve
real money movement, no identity check ever happened. Added a lightweight
"confirm your email" gate (not a login system) that hides Approve/Send
Back until the visitor types the email on file for THIS advice's specific
recommending_authority (scoped per-advice, not a global lookup). Wrong
email -> generic 401, no leak of the real email. Rate-limited: 5 wrong
attempts within 15 minutes -> 6th request of any kind (even the correct
email) gets 429 -- deliberately DB-backed via counting recent
AUTHORITY_IDENTITY_CHECK_FAILED audit_log rows rather than an in-memory
map, so unlike the admin login route's limiter this survives Vercel
serverless cold starts. Every wrong attempt writes its own distinct
audit_log row (actor "Unverified visitor", attempted email + IP in
details). On success, sets a per-token HttpOnly/Secure session cookie (no
Max-Age -- cleared on browser close) so the authority isn't re-prompted on
that same link. Found a real live blocker before writing code, not after:
"DG" (an active, currently-used authority) had no email on file, which
would have permanently locked DG out -- asked the human directly rather
than guessing fail-open vs fail-closed; human supplied DG's real email
(dg@mcciapune.com), set directly in the real DB. Gate still fails closed
(503, not counted as an attempt) for any future authority added without
an email, so this can't silently reopen. New files:
lib/advice/authority-identity.ts, two new test files (13 tests total).
Verified live against the real dev server + real Neon DB, not just mocked
tests: ran the actual 5-wrong-attempts-then-locked-out sequence including
proving a 6th attempt with the CORRECT email still 429s; confirmed the raw
page HTML shows no Approve/Send Back markup pre-confirmation; confirmed
the real Set-Cookie header shape (Secure/HttpOnly/SameSite=lax, no
Max-Age); confirmed a follow-up page load WITH that cookie renders
Approve/Send Back directly. Test rows + audit rows deleted after. tsc,
ESLint, full Vitest suite (187 passed, 6 pre-existing skipped), and next
build all clean.

2026-08-05 — Claude Code — Provider-level email send failures now write a
distinct EMAIL_SEND_FAILED audit_log row per advice (visible in that
advice's Audit Trail on /admin/advice/[id]), instead of only a
console.error only visible in server logs. Triggered by the human asking
whether a real infra failure (like the missing Gmail env vars earlier
this session) would actually be noticed — it wouldn't have been. The
"no email on file" case stays exactly as-is: still console.warn + preview
fallback in notifyAuthorityApproval's `!to` branch, never reaches send(),
never writes this new row — confirmed distinct on purpose. send() and all
5 notify*() functions gained an optional adviceId param; all 7 call sites
already had the advice id in scope. Verified live: forced a wrong
GMAIL_APP_PASSWORD via a throwaway script (never touched real .env.local),
got a real Google 535 auth rejection, confirmed the audit row landed with
that exact error text against a real existing advice row, deleted the one
test audit row afterward. Also investigated a separate report from the
human — a stale authority-approval link showing "not valid" — and
confirmed via real DB query it was old, deleted test data from the
Gmail SMTP verification session below, not a bug; no code change for
that. tsc/lint/tests clean (174 passed, 6 skipped, same skip set as
always).

2026-08-05 — Claude Code — Switched live email from Resend to Gmail SMTP
(nodemailer, service:"gmail", GMAIL_USER/GMAIL_APP_PASSWORD) as an interim
provider — mcciapune.com DNS verification in Resend is taking longer than
there's time for; Gmail works immediately, accepted trade-off is mail shows
as coming from mcciaexplore@gmail.com, not an official MCCIA domain, until
that's done. All provider-agnostic logic in lib/email/notify.ts (EMAIL_MODE
check, EMAIL_TEST_OVERRIDE_RECIPIENT redirect+subject-prefix, the no-email-
authority preview fallback, never-throw-to-caller contract) is unchanged —
only the low-level "hand this to a provider" call changed, via one new
small dispatch() function gated by a new EMAIL_PROVIDER env var (gmail
default, resend opt-in). Resend's code path kept fully intact, not deleted
— getResendClient() untouched, just unused while gmail is the default;
switching back later is EMAIL_PROVIDER=resend + a real RESEND_API_KEY, no
rebuilding. getFrom() now branches by provider: gmail always uses
GMAIL_USER (Gmail SMTP requires authenticated account = from address, so
EMAIL_FROM is not consulted in that branch), resend keeps its exact prior
EMAIL_FROM-or-default logic. Restructured lib/email/notify.test.ts into
gmail (default) and resend (dormant-but-ready) describe blocks, mocking
nodemailer.createTransport alongside the existing Resend mock — every
scenario the old Resend-only suite covered is re-proven against gmail, and
a smaller set proves resend still genuinely works too. One test-ordering
gotcha hit and documented: the Gmail transport is a lazy module-scope
singleton (same pattern the Resend client always used), so the test
asserting createTransport's exact call args has to run first, before
caching kicks in. Incidental fix while touching .env.local.example/README
for the new env vars: both still referenced the long-retired shared
ADMIN_PASSWORD and README's deploy steps still pointed at the old
/admin/authorities page — corrected both, small and directly adjacent, not
a separate cleanup pass. Verified live against the real dev server + real
Neon DB + real Gmail SMTP (not mocked): 3 real submissions run through the
actual public/admin routes exercised all 5 email types plus the no-email-
authority fallback (submission confirmation x2, authority approval x2,
sent-back via a real authority rejection, verified, payment-done, one
authority-approval that correctly fell back to preview for "DG") — every
live send got a real Gmail message ID in the server log (format
<...@gmail.com>, visibly distinct from Resend's UUID-style IDs), no auth
failures, no Google "suspicious sign-in" block on this App Password's first
sends. Confirmed via the code (getFrom() has no override path for gmail)
that every send used GMAIL_USER=mcciaexplore@gmail.com as "from" — same
no-inbox-access limitation as every prior email-verification session, so
proven from the code path rather than an inbox screenshot. Re-confirmed the
DG fallback specifically: identical warning + preview HTML dump, zero
Gmail transport calls for that one send. All 3 test submissions + 6
attachments deleted after. tsc/ESLint/Vitest all clean (see below for exact
counts).

2026-08-01 — Claude Code — Investigated the human's report of a "missing"
CASH/MCCIA/2026-27/0003 in the admin queue (0001, 0002, 0004 visible, 0003
not). No code change — concluded definitively expected, not a bug, with
direct evidence rather than assumption. Queried the real dev DB: only 3
payment_advices rows exist total (2 real pre-existing "KHAANE PE" rows at
0001/0002, 1 real live "AMAZON .IN" row at 0004 submitted today, discovered
mixed in among this engagement's own test data). Cross-referenced
AGENT_HANDOFF.md's own session history and found first-party documentation
that 0003 (and separately 0005, also "missing" from the live queue) were
each allocated to a real test submission created via the actual /api/submit
endpoint in two of this engagement's own prior sessions, then deleted as
routine test cleanup — quoted directly from those sessions' own "Shipped"
entries. serial_counters' CASH_VOUCHER counter (currently at 5) matches
exactly, with all 5 numbers fully accounted for. Confirmed no soft-delete
concept exists anywhere in the schema (grepped, zero matches) — all
deletions across this engagement's history are genuine hard DELETEs.
Checked the main serial_no series for the same pattern: far larger gaps
(only 3 rows exist, counter at 37) from the identical dozens-of-sessions
test-then-delete history, confirming this is normal, existing, engagement-
wide behavior, not something new or specific to the Cash Voucher series.
Proved series independence from the actual code and schema, not restated
from design intent: `\d serial_counters` shows a real composite PRIMARY KEY
(financial_year, series) enforced by Postgres; lib/serial.ts's shared
allocateNumber() scopes every statement (insert-on-conflict, SELECT ... FOR
UPDATE, update) by both financial_year AND series, so locking one series's
counter row can never touch the other's; allocateSerialNumber()/
allocateCashVoucherNumber() hardcode their own series constant, never
parameterized/crossed; and the /api/submit call site only invokes
allocateCashVoucherNumber() inside `paymentMode === "CASH" ? ... : null` —
for NEFT, that function is never called at all, so the CASH_VOUCHER counter
row isn't even read for a NEFT submission (literal code proof, not
inference). Flagged one transparency note that isn't a bug and isn't what
caused this gap: number allocation and the payment_advices row insert are
two separate transactions with Blob upload in between, meaning a failure
between them could in principle strand an allocated number — but this is
the same pre-existing pattern serial_no has always used, unchanged, not
introduced by the Cash Voucher work. Also flagged: the real "AMAZON .IN"
production row found during this investigation is a reminder this dev DB
has genuine live MCCIA usage in it, not just test rows — future cleanup
must positively identify test rows, not assume everything present is
disposable. No code, schema, or test changes — Part 1 concluded (a), so
per the brief's own instruction nothing needed fixing.

2026-08-01 — Claude Code — Cash Voucher display/labeling consistency fix.
Prior sessions gave Cash submissions their own PDF number (cash_voucher_no)
but every OTHER surface still said "Payment Advice" and showed serial_no
regardless of mode. Audited every surface the brief listed individually
(not assumed): public confirmation screen, admin queue list, admin detail
page, all 5 notification emails, authority-approval page, edit/resubmit
page, PDF filename. 7 of 8 needed fixing; only the PDF filename and
AdviceActions.tsx's own download buttons were already correct. Built a
shared lib/advice/document-identity.ts (documentLabelFor/displayNoFor) as
the single source of truth, used everywhere instead of each surface
re-deriving it. Added cashVoucherNo to /api/submit and /api/edit/[token]'s
JSON responses (previously missing entirely) and to SubmissionSummary
(sessionStorage handoff type). Added cash_voucher_no + payment_mode to 4
routes' DB selects that didn't have them. Renamed serialNo->displayNo and
added documentLabel across all 5 email interfaces; fixed all 5 templates'
subject lines and hardcoded body text. One flagged reversal of a prior
session's explicit decision: an earlier test asserted the Verified email's
subject must always be the literal "Payment Advice {serial}" even for Cash
"per the exact specified copy" of that session's brief — this session's
brief explicitly names "verified" as needing the Cash Payment Voucher fix,
a direct contradiction, so proceeded with the newer instruction and flagged
the reversal rather than silently picking one. Removed a redundant
Advice-No./Cash-Voucher-No. row pair from the admin detail page's Header
section now that the same two numbers show at the top of the page.
Found and reported (not fixed, per the human's explicit "ask me" instruction
for out-of-list surfaces) 4 more surfaces with the identical inconsistency:
authority-token.ts's already-actioned messages, the Bill-Passed-For route's
already-approved message, two invalid/expired-link generic error pages, and
the intake form's submit button. Fixed a stale §7 field-mapping table row
that still described the pre-numbering-series behavior. New test:
lib/advice/document-identity.test.ts (5 tests); updated
lib/email/templates.test.ts, lib/email/notify.test.ts,
lib/advice/finance-payment-done-route.test.ts, and
lib/advice/authority-reject-route.test.ts for the renamed/added fields.
Verified live against the real dev server + real Neon DB: a real Cash
submission run through submit -> authority-approve -> receive -> verify ->
Mark Payment Done via the actual routes (not direct DB writes), checking
the real rendered HTML at every step (queue, detail in both in-progress and
terminal states, authority-approval page) and reconstructing all 4 fired
emails' exact content (live mode doesn't log full HTML) — every surface
correctly showed "Cash Payment Voucher" + CASH/MCCIA/2026-27/0005, with
MCCIA/2026-27/0037 only ever appearing as the small Internal Ref., never
primary. Confirmed the downloaded PDF's filename uses the Cash Voucher
number. Test data deleted after. tsc/ESLint/Vitest all clean (see below for
exact counts). Also, separately this same day: debugged a "Incorrect email
or password" report for a real seeded account (sunils@mcciapune.com) — no
code bug; root-caused to a trailing invisible Unicode Word Joiner character
in the human's copy-paste source, confirmed via a direct bcrypt.compare()
against the real stored hash (true for the clean password, false with the
trailing junk) and a real 200 OK login with the clean password over HTTP.
See §4's Open Items for the resolved seed-script-run status this surfaced.

2026-08-01 — Claude Code — Large brief (Dual_Login_Retire_Sanction_Stamps_
Prompt.md, kept in repo root): real per-person Admin logins, Verify
auto-attribution, retired Sanction, new Payment Done flow, digital PDF
stamps. One required confirmation obtained before writing Part C's code:
grepped every real reader of approved_at/approved_by_name (exactly 2 —
Excel's Approved On/By columns, the PDF's "Approved on :" line), reported
that back, and got explicit yes on dual-writing Payment Done into those
legacy fields, matching what Sanction used to do. Part A: new admin_users
table (migration 0009, clean drizzle-kit generate, also adds
payment_advices.payment_done_at/payment_done_by), bcryptjs (pure-JS, no
native bindings). Split lib/auth.ts into 3 files preserving its documented
Edge/Node boundary: lib/auth.ts (Edge-safe, JWT only, now carries
{adminUserId, fullName, adminRole} and strictly rejects the old
{role:"admin"} shared-password token shape — clean cutover, no hybrid
compat), lib/admin-users.ts (Node, bcrypt+DB), lib/admin-session.ts (Node,
next/headers cookie reader for Server Components/Route Handlers).
ADMIN_PASSWORD check path removed entirely, no fallback, per explicit
instruction. Login route timing-safe against email enumeration (bcrypt
compares against a fixed dummy hash even for a nonexistent email; identical
generic error message either way). Landing-page paymentMode filter defaults
by role (PAYMENT_ADVICE->NEFT, CASH_VOUCHER->CASH, ALL->unfiltered) only
when the URL never mentioned paymentMode at all (sp.paymentMode===undefined,
distinct from an explicit ""="All" choice) — a default, not a wall, no
backend blocking added anywhere. ALL-role account gets 6 summary dashboard
cards (count+sum per stage) reusing the same queries that back the tab
badges, so they can't disagree. One interpretation flagged, not decided
silently: brief's Part A lists "Verified" and "Ready for Payment" as two
dashboard stages; Part C makes clear they're the same derived condition, so
built 6 cards matching Part D's tab list, not 7. seed-admin-users.ts written
but NOT run — Sunil/Abha emails are still TODO placeholders (human said
they'd supply separately), ALL-role email pre-filled from session context
(mcciaexplore@gmail.com) but flagged for the human to confirm, not assumed.
Part B: verify route no longer reads verifiedBy from the body at all —
auto-attributed from the session; deleted the now-dead verifySchema; kept
VERIFIER_NAMES (still used by the historical PATCH correction route) with an
updated comment explaining why. Removed the NameCorrectionAction from the
Verified By row on the admin detail page; left the PATCH route and its past
audit_log entries untouched. Part C: sanctioned_at/sanctioned_by columns and
the Sanctioner correction route kept exactly as they were, per explicit
"keep, don't delete" — just no UI calls POST .../sanction anymore. Ready for
Payment is derived (verified_at set, payment_done_at null), no new column,
no click. New POST .../payment-done route: session-derived paymentDoneBy,
same 404/409/409/400 guard shape Sanction used to have, still requires Bill
Passed For to already be saved (a real business rule that predates the
picker being retired, not something to drop silently) dual-writes
status/approved_at/approved_by_name, writes PAYMENT_DONE to audit_log, fires
new notifyPaymentDone() email. Deliberately not backend-role-gated (same
"default filter not a wall" philosophy) — verified live by calling it as
the wrong-role test user against a NEFT advice and confirming it still
succeeds. AdviceActions terminal branch now prefers paymentDoneAt/By,
falling back to sanctionedAt/By for pre-cutover rows. VERIFIED_TEMPLATE
copy fixed ("forwarded for sanctioning..." -> "now Ready for Payment", since
the old copy referenced a step that no longer exists). Part D: renamed 2 of
7 tabs (verified_awaiting_sanction->verified_ready_payment,
sanctioned_ready->payment_done), same underlying conditions just relabeled/
recolumned; other 5 unchanged. Part E: new lib/pdf/Stamp.tsx (rotated
bordered box, name+date inside the stamp, navy/green/amber per type) wired
into both PaymentAdviceDocument (Submitted/Recommended/Verified, Sanctioned
NEVER stamped) and CashVoucherDocument (Submitted/Recommended only, no
Verified box exists there). Iterated once on positioning after actually
rendering and reading the PDF: top-right collided with existing text,
bottom-right against the blank Signature line reads clean. Verified all 3
progression stages (submitted-only / +approved / +verified) by rendering
and reading real PDFs at each stage, confirming stamps appear/disappear
exactly on schedule and Sanctioned stays blank even at the fully-paid
terminal state. New/updated tests: finance-verify-route.test.ts (POST
describe rewritten for session-derived attribution, no more enum
validation there), finance-payment-done-route.test.ts (new, 11 tests),
admin-login-route.test.ts (new, 5 tests, includes a same-error-message
enumeration-resistance check), filters.test.ts, templates.test.ts,
notify.test.ts. Verified live end-to-end against the real dev server + real
Neon DB using 3 throwaway admin_users test rows (not the real seed script):
logged in as all 3 roles, confirmed the paymentMode default and ALL-role
dashboard render correctly; ran one real submission through submit ->
authority-approve -> receive -> verify (zero request body, confirmed
verified_by is the real logged-in name) -> Mark Payment Done (400 without
Bill Passed For saved, 200 after; deliberately called as the wrong-role
user and confirmed 200 not 403); confirmed the row moved from
verified_ready_payment into payment_done; downloaded the real PDF and
confirmed all 3 stamps render with real names/dates and Sanctioned stayed
blank; confirmed all 4 live notification emails (including the brand-new
payment-done one) actually sent via real Resend calls with real message
IDs, correctly redirected through EMAIL_TEST_OVERRIDE_RECIPIENT. All test
data (1 advice, 2 attachments, 3 admin_users rows) deleted after. Also
restored this file's own "## 6. Session Log" header, found accidentally
dropped by an earlier session's edit (no content was lost). tsc/ESLint/
Vitest (151 passing, 6 pre-existing skipped)/next build all clean.

2026-08-01 — Claude Code — Three independent fixes per the human's brief, done
in order with a report after each. Fix 1: merged the confirmed-duplicate
"S H Kopardekar" / "SUDHANWA KOPARDEKAR" authority — reassigned S H
Kopardekar's single staff_authority_options reference (0 payment_advices ever
referenced it) to SUDHANWA KOPARDEKAR, verified zero references remained
inside the same transaction (a RAISE EXCEPTION guard would have aborted
otherwise), then hard-deleted the duplicate row. Fix 2: gave the Cash Voucher
its own independent gapless numbering series (CASH/MCCIA/<FY>/NNNN),
completely separate from the unchanged main serial_no. Migration 0008 adds
payment_advices.cash_voucher_no (nullable) and changes serial_counters'
primary key to (financial_year, series) — one row per (FY, series) pair,
same SELECT ... FOR UPDATE gapless mechanism as before, now parameterized by
series instead of forking a second mechanism. Backfilled the 2 pre-existing
real Cash submissions with 0001/0002 in the same migration. Both numbers now
allocate in the same transaction at /api/submit; /api/edit/[token] handles
the edge case of a resubmission flipping payment mode. Cash Voucher PDF's
"No." field and the admin detail page (new "Advice No." + "Cash Voucher No."
rows, Cash-mode only) both updated. Deliberately did not add cash_voucher_no
to the Excel export — flagged as a question for the human, mirroring the
already-declined "Expenditure Breakdown" column. New unit + TEST_DATABASE_URL-
gated integration tests in lib/serial.test.ts (FY boundary, series
independence, NEFT never allocating a Cash Voucher number). Fix 3: restyled
the admin tab bar from underline to boxed/pill (rounded-md border on every
tab; active = filled navy bg-[#0b1f3a] text-white; inactive = border-gray-300
bg-white text-gray-600 with navy hover) — purely cosmetic, no filter/gating
logic touched, count badges unchanged. All three verified live against the
real dev server + real Neon DB: the merge via direct SQL + a real Cash
submission's PDF correctly showing "SUDHANWA KOPARDEKAR"; the numbering
series via a real /api/submit Cash submission whose downloaded PDF printed
CASH/MCCIA/2026-27/0003 while serial_no stayed MCCIA/2026-27/0034; the tab
restyle via the real rendered admin HTML's class strings (no browser
automation tool exists in this environment — flagged, not silently claimed
as a visual screenshot). All test data cleaned up after. tsc/ESLint/Vitest/
next build all clean (see below for exact counts).

2026-07-31 — Claude Code — Full live-send verification of all 4 notification
emails, per the human's brief, with a real RESEND_API_KEY + EMAIL_MODE=live +
EMAIL_TEST_OVERRIDE_RECIPIENT set in .env.local. Pure verification, no code
changed. Found a real discrepancy before testing (exactly what the human
asked to be caught): "S H Kopardekar" still has no email — the human's edit
landed on the separate "SUDHANWA KOPARDEKAR" row instead. Proceeded using
SUDHANWA KOPARDEKAR for the authority-with-email test since it genuinely has
the email. All 5 requested tests passed with real evidence (Resend message
IDs from server logs, plus independently re-rendering each template with the
exact data each route used, to get literal subject/body content without
needing inbox access): submission confirmation (NEFT, correct fields, no
Cash Voucher link), authority approval with email (real send, approval link
verified to actually load the right submission), authority approval without
email (no error, clean fallback-to-preview, confirmed via server logs — but
confirmed a real gap: nothing in the admin UI distinguishes this from a
successfully-notified authority, flagged not fixed), sent-back email (remarks
text and edit link both correct in the body), and Verified email (fires only
at Verify, confirmed zero email activity at Approve/Receive via server logs).
No browser automation tool exists in this environment — flagged rather than
silently claimed; drove the real /api/staff/search + /api/submit endpoints
instead, which is the same server-side path the actual form calls. All test
data (4 submissions) cleaned up after; DB back to its single pre-session
baseline row. Flagged for the human: the Kopardekar mismatch, the no-email
admin-visibility gap, that onboarding@resend.dev is technically incapable of
reaching anyone but the account owner (not just a spam-risk, a hard block,
already known from an earlier session) until mcciapune.com is verified, and a
recommendation to keep the override on for the first send or two after
EMAIL_FROM changes to a real domain since that's an entirely untested
deliverability situation. EMAIL_MODE/EMAIL_TEST_OVERRIDE_RECIPIENT left
exactly as the human set them, local-only, nothing committed changed.

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

2026-08-18 — Claude Code — Advance Payment refinement: payee auto-fills
from submitter (vendor typeahead hidden), Bill & Reference section fully
hidden, NEFT bank details optional, new "Advance Payment" admin tab
landing-only (confirmed the scope with the human via AskUserQuestion
before building, per their explicit request). Found and fixed a real
bug via actual browser testing (temporary Playwright install, uninstalled
after — empty package.json/package-lock.json diff confirmed): react-hook-
form retains a hidden field's stale native default ("" or NaN) after
unmount, which silently blocked every Advance submission going through
the browser form (billDate/basicAmount/gstAmount register on page load
since paymentMode defaults NEFT) with zero visible error. Fixed at the
schema level (lib/validation/payment-advice.ts) — also fixes a pre-
existing, unrelated latent bug in the plain NEFT→Cash switch. Live-
tested end-to-end: real browser submission → ADV/MCCIA/2026-27/0004 →
curl-driven authority approval → confirmed landed in ?tab=advance_payment
and absent from ?tab=awaiting_finance → confirmed receive moved it into
the shared received_in_process tab. tsc/ESLint/Vitest (271 passing)/
`next build` all clean. Test data (1 advice + attachment + blob + 1
throwaway admin_users login) deleted afterward. Committed and pushed.

2026-08-18 — Claude Code — Moved Advance Payment off the main form onto
its own route, /advance, since the 3-way Payment Mode radio made fields
conditionally appear/disappear confusingly. PaymentAdviceForm.tsx now
takes a fixed mode: "standard" | "advance" prop instead of a runtime
isAdvance toggle — same shared component, no markup duplicated between
"/" and the new /advance page. Section 4 is back to a plain NEFT/Cash
2-way radio for both modes; Bill & Reference and Tax Invoice are
structurally absent (not conditionally hidden) on /advance; main form
gained a visible banner linking to /advance. /edit/[token] now derives
mode from advice.isAdvance. Found and fixed a second real bug via
browser testing: the Particulars "seed a default row if empty" effect
ran during initial mount now that isAdvance is fixed true from the
first render on /advance, and React Strict Mode's dev-only double-
effect-invocation silently seeded two rows instead of one against a
stale closure — second row's amount stayed 0, failing validation with
no visible error. Fixed by seeding the row in useForm's defaultValues
instead of via an effect. Live-tested end-to-end with another temporary
Playwright install (uninstalled after, empty package.json/package-
lock.json diff): confirmed exactly one Particulars row on load, no
Bill No./Tax Invoice anywhere in the DOM on /advance, payee auto-fill,
main form's radios back to NEFT/Cash only → real submission →
ADV/MCCIA/2026-27/0005 → curl-driven approval → confirmed landed in
?tab=advance_payment, absent from ?tab=awaiting_finance. tsc/ESLint/
Vitest (271 passing)/`next build` all clean. Test data (1 advice +
attachment + blob + 1 throwaway admin_users login) deleted afterward.
Did not separately browser-test /edit/[token]'s new mode wiring (single-
line, type-checked change) — flagged, not silently assumed. Committed
and pushed.

2026-08-18 — Claude Code — Simplified Advance Payment's Particulars from
a category-dropdown + conditional "Other" field to plain description +
amount, matching Cash Voucher's line items exactly (same underlying
cashVoucherItemSchema/calculateCashVoucherTotal reused directly, not a
parallel copy). New shared components/form/LineItemsField.tsx replaces
the duplicated add/remove/sum JSX in both the Cash Voucher and
Particulars blocks. Migrated advance_particulars (0012 adds description
nullable, one-off backfill script populates it from category/
other_description, 0013 sets NOT NULL + drops both old columns) — this
mattered because 3 REAL rows already existed from an actual user's
prior submission (ADV/MCCIA/2026-27/0003, discovered via a live DB
check before touching anything), not just test data; verified all 3
migrated correctly and left in place. Updated both PDF templates and
the admin detail page's particulars table to Description/Amount only,
no Category column. Live-tested end-to-end with another temporary
Playwright install (uninstalled after, empty diff): confirmed zero
<select> elements on /advance, added 3 real Particulars rows, confirmed
the live total and confirmation-page amount matched, downloaded and
read the real PDF confirming the 2-column table renders correctly, and
confirmed the admin detail page matches. tsc/ESLint/Vitest (274
passing)/`next build` all clean. Test data (1 advice + attachment +
blob + 1 throwaway admin_users login) deleted afterward — the 3 real
production rows were left untouched, not deleted. Committed and pushed.
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
| No. | No. | ~~kept — reuses Payment Advice `serial_no`~~ **Superseded** — has its own independent series, `cash_voucher_no` (`CASH/MCCIA/<FY>/NNNN`), since the Cash Voucher numbering session; this row was never updated to match at the time, fixed 2026-08-01. |
| Date | Date | kept |
| Rs./Ps. columns, Total | Rs./Ps. columns, Total | kept, Total now auto-summed from line items |

---

2026-09-04 — Codex — Grouped the three independent reference-number series
throughout `/admin/submissions`. Added a stable type-first SQL ordering and
type-aware displayed-reference expression, so Payment Advice (`serial_no`),
Cash Voucher (`cash_voucher_no`), and Advance Payment (`advance_no`) are each
contiguous and sort internally without being compared as one series. Added
lightweight group-header rows while retaining per-reference badges. Other
column sorts now operate within the stable groups; Sent Back remains
oldest-first within each group. Authenticated local rendering with the real
PAYMENT_ADVICE account confirmed /0009 → /0008 → /0007 together, followed by
ADV/.../0001 only under its Advance Payment group. Tests/build clean.

2026-09-04 — Codex — Standardized all displayed/business-calendar dates on
India Standard Time and added submission-type badges to the Admin queue.
Introduced `lib/date-time.ts` as the single `Intl`/`Asia/Kolkata` source for
IST calendar parts, date/date-time display, and date-only calendar helpers.
Replaced environment-dependent formatting across Admin/Authority lists,
detail/action views, token approval, both PDF templates, all email templates,
the public form default/max date, validation, Admin analytics, and serial FY
selection. PostgreSQL date-only values stay date-only; no historical data was
updated. Exact boundary test: `2026-03-31T19:00:00Z` renders as 01/04/2026
00:30 IST and maps to FY 2026-27; the instant immediately before IST midnight
maps to 2025-26. `/admin/submissions` now renders a subtle Payment Advice /
Cash Voucher / Advance Payment badge below each display reference. A read-only
authenticated local render backed by real production rows confirmed all three
labels against MCCIA/2026-27/0008, CASH/MCCIA/2026-27/0004, and
ADV/MCCIA/2026-27/0001. Browser control was unavailable, so no screenshot is
claimed. TypeScript, ESLint, 322 tests (7 skipped), and build clean.

2026-09-04 — Codex — Resolved the 4.5 MB production attachment-upload
incident using Vercel's documented client-upload architecture. Added the
short-lived `/api/attachments/upload` token route (private PDF only, 10 MB
per file), browser-direct uploads in the one shared form used by regular
Payment Advice, Cash Voucher, and Advance Payment, and metadata-only final
requests for both `/api/submit` and `/api/edit/[token]`. Final routes verify
each stored Blob's pathname, URL, size, content type, and `%PDF-` signature;
resubmission still retains old files unless their document type is replaced.
Added running attachment-total UI, distinct upload progress copy, non-JSON
response parsing, explicit 413 messaging, and pending-upload cleanup. Serial
allocation was not moved or otherwise changed; pre-submit objects use random
`pending-uploads/...` paths because attachment readers already rely on the
DB pathname. Live real-Blob test uploaded two 3 MB PDFs (6,291,456 combined),
then deleted and verified both absent; no advice row or serial was consumed.
Browser-control was unavailable, so no visual click-through is claimed.
TypeScript, ESLint, 318 tests (7 skipped), and production build clean.

2026-09-04 — Codex — Diagnosed the production Cash Voucher submission
failure reported at approximately 13:16 IST without creating test data or
mutating production. Vercel runtime logs showed no `/api/submit` invocation
or 4xx/5xx function error around the attempt; Neon was reachable and had a
successful later write. Reconciled 3 advice rows, 7 attachment rows, 7 Blob
objects, audit history, and serial counters: the failed attempt left no DB
row, Blob, audit event, or counter gap. Code/platform inspection identified
the unresolved 10-MB-per-file UI validation versus Vercel's 4.5-MB total
Function request-body limit; requests exceeding that cap are rejected before
application logging or serial allocation. The successful Cash submission's
two saved attachment rows total only 272,406 bytes, consistent with small
payloads working. Excel export open decisions are reporting-only and do not
touch submission. No fix was made during this diagnostic-only session; the
production risk is recorded in §4.

*End of handoff file. Both agents: read §0 again before starting work.*
