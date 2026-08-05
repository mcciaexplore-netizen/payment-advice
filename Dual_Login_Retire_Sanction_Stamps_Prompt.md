# MCCIA Payment Advice — Real Logins, Retire Sanction Step, Digital Stamps

Read AGENT_HANDOFF.md first for full context. This is a significant
workflow change — read carefully before writing code, and stop to ask
if anything below is ambiguous when you hit it in the actual codebase.

---

## PART A — Real per-person logins, replacing the shared admin password

### New table
```
admin_users
  id              uuid pk
  full_name       text not null
  email           text unique not null
  password_hash   text not null          -- bcrypt
  role            text not null          -- 'PAYMENT_ADVICE' | 'CASH_VOUCHER' | 'ALL'
  is_active       boolean default true
  created_at      timestamptz default now()
  last_login_at   timestamptz
```

Three accounts total, seeded via a script (not built as a full user-
management UI — 3 people doesn't need that yet):
- Sunil — role `PAYMENT_ADVICE` — handles NEFT/Payment Advice submissions
- Abha — role `CASH_VOUCHER` — handles Cash Voucher submissions
- A third account, role `ALL` — for the person who needs to see
  everything (me) — I'll supply this email separately

I'll provide real names + emails for Sunil and Abha before you run the
seed script. **Generate a strong random password per account, print
each one once to the console/a local-only report file (gitignored,
never committed), and never log or store them anywhere else in plaintext
— only the bcrypt hash goes in the DB.** I need to see the generated
passwords once to pass them along.

### Replace the shared `ADMIN_PASSWORD` login entirely
- Login page now takes email + password, checks against `admin_users`
- Update `lib/auth.ts` JWT to carry `admin_user_id`, `full_name`, and
  `role` as claims
- Update `last_login_at` on successful login
- Remove the old shared-password env var and its check path entirely —
  don't leave it as a fallback

### Access model (per the decision already made — NOT strict siloing)
- On login, each user's default landing tab matches their role:
  `PAYMENT_ADVICE` → defaults to Payment-Advice-filtered queue view,
  `CASH_VOUCHER` → defaults to Cash-Voucher-filtered view, `ALL` →
  defaults to a combined view (see Part D).
- This is a **default filter, not an authorization wall** — any logged-
  in user can still click into "All" and see everything, per the
  explicit decision to keep this simple rather than build real per-role
  backend restrictions. Don't add backend query-level blocking beyond
  requiring *some* valid login.

### "Sees everything" account — simple dashboard
For the `ALL`-role account, add a lightweight summary view as the
landing page — not a big analytics build, just: count + total amount
for each pipeline stage (Waiting on Authority, Awaiting Finance Review,
Received & In Process, Verified, Ready for Payment, Payment Done, Sent
Back), presented as simple cards above the same queue table
`PAYMENT_ADVICE`/`CASH_VOUCHER` users see (just unfiltered for this
role). Keep this minimal.

---

## PART B — Verify auto-attributes to the logged-in user

Drop the old 4-person `VERIFIER_NAMES` dropdown entirely. When a
logged-in Admin clicks Verify, `verified_by` is set automatically from
their session (`full_name` on `admin_users`), not chosen from a list.
Same audit_log behavior as before (write the entry, actor = the real
user now, not a picked name).

The existing "Correct name" feature built for Verifier/Sanctioner
corrections (from a prior session) — for Verify, this no longer makes
sense as a name-picker correction (there's nothing to pick from
anymore, it's just who was logged in). Remove that correction UI for
Verify specifically. Leave the underlying audit log entries from past
corrections untouched — this is a going-forward behavior change, not a
data cleanup.

---

## PART C — Retire the blocking Sanction step; replace with Ready for Payment → Payment Done

This is the biggest logic change. Read carefully.

**What's being retired:** the hardcoded 2-person `SANCTIONER_NAMES`
picker and the requirement that Sanction happen in-app before a
submission is considered final. In real practice, sanctioning now
happens physically/offline whenever Chintamani gets to it in bulk — the
app should stop gating on it.

**What replaces it**, immediately after Verify:
- A submission automatically becomes **"Ready for Payment"** the moment
  `verified_at` is set — no separate click needed, this is just the
  natural next state once Verified.
- Add a manual action, available to the logged-in Sunil/Abha account
  that owns that submission type: **"Mark Payment Done"** — sets
  `payment_done_at` (timestamptz) and `payment_done_by` (auto-attributed
  from the logged-in user, same pattern as Verify — no picker).
- **On "Payment Done," fire a new email to the submitter** — something
  like "Your Payment Advice MCCIA/2026-27/00XX has been paid." This is
  the only new notification point; nothing fires at "Ready for Payment"
  since that's automatic, not an action.
- **Recommended dual-write, please confirm this matches intent before
  finalizing:** since "Sanction" used to be what set the legacy
  `status = 'APPROVED'`, `approved_at`, `approved_by_name` fields (which
  Excel export and other downstream code read from), have **"Mark
  Payment Done" perform that same dual-write** instead — using
  `payment_done_at` as `approved_at` and `payment_done_by` as
  `approved_by_name`. This keeps Excel and anything else reading those
  legacy fields working without further changes. If this doesn't sit
  right, stop and ask me before implementing — this is a judgment call
  bridging old and new terminal states, not a certainty.

**Keep, don't delete:** the existing `sanctioned_at`, `sanctioned_by`
columns, the correction-audit-log entries, and all historical data tied
to them. Just stop surfacing Sanction as an active step in the queue/UI
going forward. If Chintamani's physical sanctioning ever needs to be
logged digitally later, that's a future task, not this one.

**No login for Chintamani right now** — not in scope for this task.

---

## PART D — Tabs: reflect the new flow, remove the old Sanction stage

Replace the current tab set with:

`Waiting on Authority` · `Awaiting Finance Review` ·
`Received & In Process` · `Verified — Ready for Payment` ·
`Payment Done` · `Sent Back` · `All`

- "Verified — Ready for Payment": `verified_at IS NOT NULL AND
  payment_done_at IS NULL`
- "Payment Done": `payment_done_at IS NOT NULL`
- All other tabs and their filter logic stay exactly as previously
  audited and confirmed correct — only these two tabs change to reflect
  the retired Sanction stage.
- Keep the boxed/pill tab styling already shipped.

---

## PART E — Digital stamps on the printed PDF

Applies to both the Payment Advice PDF and the Cash Voucher PDF, on
whichever of these signature boxes exist on each (per the existing
field mapping — Payment Advice has all four boxes; Cash Voucher only
has Submitted by / Recommended by / Sanctioned by, no Verified by box).

| Box | Stamp condition | Stamp shows |
|---|---|---|
| Submitted by | always, once submitted | "SUBMITTED" + submitter's name + `submitted_at` date |
| Recommended by | once `authority_approved_at` is set | "APPROVED" + the approving authority's name + `authority_approved_at` date |
| Verified by (Payment Advice only) | once `verified_at` is set | "VERIFIED" + `verified_by` + `verified_at` date |
| Sanctioned by | — | **leave completely blank, no stamp, ever** — this stays a physical wet-ink box for Chintamani, untouched by this feature |

Design:
- Render as a clean bordered rectangle/box with a slight rotation (5–10°)
  for a "stamped" feel, in solid brand colors — not an attempt to
  reproduce rough ink-texture artwork, that won't render reliably in a
  generated PDF. Suggest: green border/text for Approved, navy for
  Submitted, amber or navy for Verified — use your judgement within the
  existing palette, but keep all three visually consistent with each
  other (same box style, just different accent color per stamp), not
  three different designs.
- Keep name + date **inside the stamp box itself**, not as separate
  text elsewhere in that cell — per the instruction, the stamp carries
  both.
- If a box's condition isn't yet met (e.g. Authority hasn't approved
  yet), that box stays exactly as it is today — blank, waiting for a
  physical signature, no stamp.
- Test with a submission at each stage (submitted only, submitted +
  approved, fully verified) and show me the rendered PDF at each stage
  so I can see the stamps actually appear/disappear correctly as a
  submission progresses.

---

## Acceptance criteria

- [ ] Shared `ADMIN_PASSWORD` login fully removed, replaced by
      `admin_users` email/password login
- [ ] Sunil, Abha, and the `ALL`-role account seeded; passwords
      generated and shown to me once, never stored in plaintext
- [ ] Each role defaults to its own filtered queue but can access "All"
- [ ] `ALL`-role account has the simple summary dashboard
- [ ] Verify auto-attributes to the logged-in user; old 4-person picker
      and its correction UI removed for Verify
- [ ] Ready for Payment happens automatically on Verify; Payment Done is
      a manual action, auto-attributed, fires the new email
- [ ] Confirmed with me (not assumed) whether Payment Done should
      perform the legacy `status`/`approved_at`/`approved_by_name`
      dual-write
- [ ] Tabs updated per Part D, all other tab logic unchanged and
      re-verified against the real dev DB
- [ ] Stamps render correctly and conditionally on both PDF types per
      the table in Part E, Sanctioned-by box confirmed to never receive
      a stamp
- [ ] tsc/lint/tests/build all clean
- [ ] AGENT_HANDOFF.md fully updated: new auth model, retired Sanction
      step, new Payment Done flow, new email, stamp feature — and
      explicitly note the old `SANCTIONER_NAMES` list and Sanction UI
      are retired but their data/columns are preserved, not deleted

## Ask me before proceeding if:

- The dual-write recommendation in Part C doesn't look right once you
  see how `approved_by_name` is actually used elsewhere in the code
- You find any other place in the codebase that still assumes the old
  shared-admin-password model or the old Sanction-blocks-completion
  logic — don't patch around it silently, tell me what you found
