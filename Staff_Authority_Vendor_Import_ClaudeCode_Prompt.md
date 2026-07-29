# MCCIA Payment Advice — Staff/Authority Roster + Vendor Import

Read AGENT_HANDOFF.md first for full project context before starting.

## 0. What this task does

Replaces the department-based Recommending Authority model with a
person-based one, seeds it from real MCCIA data, imports the active
vendor list, and adds auto-fill behavior on the public form so
old-fashioned users type as little as possible.

I've attached `Master-_FILE_FOR_AI.xlsx` with three sheets:
- **"Tally"** — full ~2000-row Tally ledger list. IGNORE this sheet entirely,
  not part of this task.
- **"Recommende"** — 52 staff members and their recommending authorities
- **"Sheet2"** — 663 active vendor names

## 1. Data model changes

### Replace the department-based authority table

The current `recommending_authorities` table (department + head name) is
wrong for this business — authorities are assigned per staff member, not
per department. Migrate to:

```
recommending_authorities   -- the pool of actual approvers (people or DG)
  id                uuid pk
  authority_name    text not null        -- e.g. "Chintamani Shrotri", "DG (Director General)"
  email             text                 -- nullable, admin can add later
  is_active         boolean default true
  created_at        timestamptz default now()

staff_members       -- the roster of people allowed to submit
  id                uuid pk
  full_name         text not null
  is_active         boolean default true
  created_at        timestamptz default now()
  updated_at        timestamptz

staff_authority_options   -- link table: which authorities apply to which staff, ordered
  id                     uuid pk
  staff_member_id        uuid not null references staff_members(id) on delete cascade
  recommending_authority_id  uuid not null references recommending_authorities(id)
  sort_order             integer not null   -- 1 or 2 (first/second option shown)
  created_at             timestamptz default now()
  unique(staff_member_id, recommending_authority_id)
```

Keep `payment_advices.recommending_authority_id` as-is (FK to
`recommending_authorities`) — that part of the schema doesn't change,
only how it's populated and how the UI drives selection.

**Migrate cleanly** — write a proper Drizzle migration, don't hand-edit
the DB. If any existing `payment_advices` rows reference the old
department-based `recommending_authorities` rows, do NOT delete those
old rows blindly; check with me first if any exist (there shouldn't be
any yet since this is pre-launch, but verify, don't assume).

### Vendors table

No schema change needed — `vendors` already supports name-only records
with the rest nullable. Just seeding data.

## 2. Import: staff members + recommending authorities

Source: "Recommende" sheet, columns `Name`, `Recommended by`, and the
unlabeled 4th column (call it `second_authority` in your parsing).

Parsing rules:
1. `Name` → one `staff_members` row per unique name (52 total, trim
   whitespace, keep casing as-is from the sheet).
2. `Recommended by` → first `recommending_authorities` entry for that
   staff member (`sort_order = 1`). Dedupe: if the same authority name
   appears for multiple staff, reuse the same `recommending_authorities`
   row rather than creating duplicates — match case-insensitively but
   store the canonical casing you encounter first.
3. `second_authority` (4th column) → if present AND non-empty AND does
   NOT case-insensitively match that row's own `Name` value, create a
   second `staff_authority_options` entry (`sort_order = 2`) for that
   authority. If it DOES match the row's own name, skip it — this is a
   known data-entry artifact, not a real second authority.
4. Special value `DG` (any casing/spacing) → create/reuse a single
   `recommending_authorities` row with `authority_name = "DG"` (store
   exactly as "DG" — do not expand or paraphrase it). Do not create a
   separate "DG" row per staff member — it's one shared authority
   entity referenced by many staff.
5. Self-referencing rows (`Name` and `Recommended by` are the same
   person, e.g. Nikhil Jain → Nikhil Jain) are valid, not an error — it
   means that person can select themselves as their own first authority
   option. Import as-is.

**Output a report after import**, printed to console AND saved as
`import-report.md` in the repo root (gitignored, not committed):
- Total staff members created
- Total unique recommending authorities created (list them)
- Every row where rule #3's "skip self-referencing second authority"
  was applied — list staff name + the skipped value, so I can eyeball
  it
- Any row that didn't parse cleanly (missing Name, etc.) — list it,
  don't silently drop it

## 3. Import: vendors

Source: "Sheet2", column `Party Name`, 663 rows.

- Import **verbatim** — no cleanup, no de-duplication, no suffix
  stripping. Store exactly as in the sheet, including `-CR`, `-NEW`,
  trailing whitespace/newlines (trim only leading/trailing whitespace,
  keep everything else, since this must stay exact enough to eventually
  reconcile with Tally).
- Populate `company_name` only. All other vendor fields (`address`,
  `contact_person`, `contact_phone`, `email`, `gstin`, `udyam_number`)
  stay `NULL` — submitters and Admin fill these in as before, per the
  existing "auto-fill what's known, leave the rest for the submitter"
  behavior already built.
- `is_active = true` for all imported rows.
- If a `Party Name` value is an exact duplicate of another row already
  in the sheet, import only one record — but report duplicates found.

## 4. Build the import as a reusable script, not a one-off

Add `scripts/import-master-data.ts`, run via `npm run import:master-data
-- path/to/Master-_FILE_FOR_AI.xlsx`. It should:
- Be idempotent-safe for staff/authorities (safe to re-run without
  creating duplicates — use the dedupe/reuse logic from §2), but for
  vendors, warn and skip re-import if vendors already exist (ask before
  overwriting).
- Read directly from the xlsx (use a library like `xlsx` or `exceljs`,
  whichever the project's Excel export already uses — check
  `lib/excel` or similar before adding a new dependency).
- NOT touch any other table.

Reason for making this a script rather than a manual SQL dump: if MCCIA
sends an updated staff list or vendor list in future, you re-run this
instead of me hand-writing SQL.

## 5. Public form UX changes

### Submitter Name field
Stays **free text** (not a restricted dropdown) — but add a **typeahead
suggestion dropdown** as they type, matching against `staff_members`
(active only). This is suggestion, not enforcement: if their name isn't
in the list (new hire, typo, etc.), they can still type freely and
submit — never block submission on this field.

### Recommending Authority field — the auto-fill behavior
When the typed Submitter Name **matches an existing active staff
member** (exact match after they select from the typeahead, or an exact
case-insensitive match if they type the full name without using the
dropdown):
- Look up that staff member's `staff_authority_options`, ordered by
  `sort_order`.
- If they have exactly 1 authority option: pre-select it automatically,
  shown as a selected pill/radio the submitter can still change.
- If they have 2: show both as radio options, neither pre-selected,
  submitter picks one.
- Always show an **"Other"** radio option alongside their real
  option(s). Selecting "Other" reveals a free-text field for typing an
  authority name manually.
- If the typed Submitter Name does NOT match any known staff member:
  show the Recommending Authority field as **free text only** (or a
  full dropdown of all known `recommending_authorities` plus "Other" —
  your call on which is less friction, but don't leave it blank with no
  guidance).

### Admin: manage staff & authorities
Add `/admin/staff` — CRUD for `staff_members` (add/edit/deactivate) and
their `staff_authority_options` (assign up to 2 recommending
authorities per staff member, reorder). Add authority management here
too (create new `recommending_authorities` entries, e.g. when a new
approver joins) rather than a separate screen — keep it one page since
they're tightly related. This is how new hires get added without a
developer touching the database.

## 6. Vendor typeahead — no changes needed to existing behavior

The existing vendor typeahead (built in Phase 1) should now just have
663 more real records to match against. Confirm it still auto-fills
correctly against the newly imported vendor rows (which have only
`company_name` populated) — i.e. selecting one should populate the name
field and leave address/GSTIN/etc. blank and editable, exactly like it
already does for vendors with full data.

## 7. Acceptance criteria

- [ ] Migration applied cleanly, no data loss on any existing table
- [ ] `npm run import:master-data` seeds 52 staff members, all unique
      recommending authorities (including one shared "DG (Director
      General)" row), and the staff-authority link table correctly
- [ ] Import report generated and shown to me before you consider this
      done — I want to see the skipped-self-reference list and the
      authority list before we call this correct
- [ ] 663 vendors imported verbatim, name-only, duplicates reported
- [ ] Public form: typing a known staff name surfaces their 1–2
      authority options (or auto-selects if only 1), "Other" always
      available, unknown names degrade gracefully to manual entry
- [ ] `/admin/staff` lets Admin add a new staff member and assign up to
      2 authorities, and add new authorities, without touching the DB
      directly
- [ ] Existing vendor typeahead behavior unaffected by the larger
      dataset
- [ ] Update AGENT_HANDOFF.md: note the schema change (old
      department-based authority table replaced), the new tables, and
      that this import is now a repeatable script

## 8. IMPORTANT — scope boundary for this session

**Recommending Authority is NOT informational.** Correction to my
earlier (wrong) understanding: the named authority/authorities for a
submission must actually approve it before Finance can act. Finance
Admin's role is to confirm all required approvals are complete, then
download and proceed with payment — Admin does not unilaterally
approve on their own authority the way Phase 1 currently models it.

**This session's job is data import ONLY** — staff members, their
authority mappings, and vendors, per §§1–6 above. Do NOT attempt to
build the actual approval workflow (per-authority approve actions,
sequencing if a staff member has 2 authorities, how an authority
receives/approves a submission, etc.) in this session. That's a
separate, larger design change to the existing single-Admin-approval
model from Phase 1, and needs its own dedicated planning pass before
any code is written — it is explicitly OUT OF SCOPE here.

The `staff_authority_options` link table you're building now is still
correct and needed either way — it's the data the future workflow will
be built on top of. Just don't build the workflow logic itself yet.

## 9. Assumptions I'm making — flag if wrong, don't silently proceed if you hit a case these don't cover

1. Rows where the 4th column repeats the staff member's own name are
   data-entry noise, not a real second authority — skip them, but
   report every instance.
2. The 52 names in "Recommende" are not an exhaustive/locked list —
   Admin can add more via `/admin/staff`, and the public form never
   blocks submission based on whether a name matches.
3. "DG" is imported as a single shared authority record with the
   literal name "DG" — if DG should actually carry a real person's name
   and contact details, that's a data question for the human, not
   something to guess here.

If you encounter a row shape not covered above (e.g. a name with both a
real 2nd authority AND it happens to equal something odd, or a blank
`Name` cell), stop and show me the row rather than guessing.
