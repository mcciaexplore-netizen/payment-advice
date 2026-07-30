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

**Last updated:** 30 July 2026, by Claude Code (Approval Workflow)

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
- 🔴 **Pre-existing bug, not introduced this session, not fixed:** `/api/edit/[token]` resubmit 500s if a replacement attachment file has the **same filename** as the one it's replacing (deterministic Blob pathname collision, no `allowOverwrite`/`addRandomSuffix` on that route's `put()` calls). Reproducible outside the Approval Workflow entirely — any admin- or authority-triggered send-back followed by a same-filename resubmit hits it. Needs a fix (likely `addRandomSuffix: true` on that specific `put()` call) but was out of scope for this session; flagging rather than silently patching an unrelated route.
- 🟡 **`AuthorityApprovalView`'s interactive browser behavior (Approve/Send Back buttons, remarks textarea, already-actioned banner) was NOT tested in an actual browser** — verified via direct API calls (`curl`) against the real dev server + real DB, and the page's server-rendered HTML was inspected, but no browser automation was available this session. The API/data layer is confirmed correct end-to-end; the React interaction layer (button state transitions, error display) is not.
- 🟡 **Admin queue tab UI (`TabLink`, badge counts) was verified via rendered HTML inspection, not a live click-through in a browser** — confirmed the counts and `?tab=` links are correct by fetching each tab's URL directly and checking which serial numbers appear, but did not visually confirm the active-tab styling or manually click through page transitions.

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

## 6. Session Log

Append one entry per session, newest at the top. Keep entries short — this is a changelog, not a diary.

```
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
