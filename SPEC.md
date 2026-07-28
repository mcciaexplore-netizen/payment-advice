## 0. Instructions to you (Claude Code)

You are building an internal web application for the **Finance & Accounts department of MCCIA (Mahratta Chamber of Commerce, Industries and Agriculture), Pune**.

Rules for this build:

1. **Do not invent business rules.** If something in this spec is ambiguous, stop and ask me before coding.
2. **Build Phase 1 only.** Phase 2/3 are listed at the end purely so your data model and folder structure don't need rewriting later. Do not implement them.
3. Work incrementally: scaffold → schema + migrations → public form → PDF → admin → export. Show me the app running after each milestone.
4. Write a `README.md` with every environment variable, how to run migrations, and how to deploy to Vercel.
5. No secrets in code. Everything through `.env.local` / Vercel env vars.

---

## 1. Problem statement

Today, when anyone at MCCIA needs a payment made, they **fill a paper "Payment Advice" form by hand** (form no. `MCCIA/ACTT/PAD/013`). It is signed and approved physically, then walked over to the Finance department, where a finance executive **reads the paper and manually re-types the data into TallyPrime**.

We are replacing the *filling, tracking and printing* part of that process with a web app. We are **not** replacing the physical signing — signatures stay wet-ink on the printout.

The new flow:

1. Anyone who needs a payment made opens the site (no login) and fills the Payment Advice form.
2. They attach scanned PDFs — tax invoice, approval/budget letter, PO, etc.
3. On submit, the system assigns a serial number and stores the record.
4. The **Admin** (Finance) logs in, reviews the entry and its attachments, and either **Approves** it or **Sends it back** to the submitter with remarks for correction.
5. Once approved, the system generates a **pixel-faithful A4 PDF replica of the existing paper form**, which is printed and routed for physical signatures and filing.
6. Admin can filter all entries and **export to Excel**, which Finance currently uses as the source for Tally data entry.

---

## 2. Tech stack (fixed)

| Layer | Choice |
|---|---|
| Framework | **Next.js (App Router, TypeScript)** |
| Hosting | **Vercel** |
| Database | **Postgres (Neon)** — via `@neondatabase/serverless` + Drizzle ORM |
| File storage | **Vercel Blob** |
| Validation | **Zod** (shared schema between client form and API route) |
| Forms | React Hook Form + Zod resolver |
| Styling | Tailwind CSS |
| PDF generation | **`@react-pdf/renderer`**, server-side, in a route handler. Do **not** use Puppeteer/Playwright — Chromium is unreliable on Vercel serverless. |
| Excel export | `xlsx` (SheetJS) |
| Admin session | Signed HTTP-only JWT cookie via `jose` |

Everything must run on Node.js runtime route handlers (not Edge) where Blob/PDF is involved.

---

## 3. Brand and UI

Follow the MCCIA Applied AI Studio brand system:

- **Navy `#0B1F3A`** (primary / headers), **Forest green `#2E8B57`** (success, approve), **Amber `#E8A33D`** (pending, warnings)
- Fonts: **DM Serif Display** for headings, **Outfit** for body/UI (Google Fonts)
- Desktop-first. It must not break on a tablet, but **mobile is not a priority** — do not spend effort on a mobile-optimised approval experience.
- The public form is used by non-technical staff: large labels, clear section headers, plain-language helper text, inline errors, and a visible required/optional marker on every field.
- MCCIA logo: I will place the asset at `/public/mccia-logo.png`. Reference it; do not generate a placeholder logo.

---

## 4. Roles

| Role | Auth | Can do |
|---|---|---|
| **Submitter** (any MCCIA employee) | **None — public URL** | Fill and submit the form; re-open and correct a form only via a one-time signed "edit link" issued when Admin sends it back |
| **Admin** (Finance) | **Password login** | See all submissions, view/download attachments, approve, send back with remarks, edit the "Bill passed for Rs." field, generate PDF, export Excel, manage Vendors and Recommending Authorities |

Admin auth for Phase 1: a single shared password in `ADMIN_PASSWORD` env var, exchanged for a signed JWT in an HTTP-only, `secure`, `sameSite=lax` cookie (7-day expiry). Protect all `/admin/*` routes and all admin API routes with middleware. **Isolate this in `lib/auth.ts`** so it can be swapped for Google Workspace SSO later without touching page code.

---

## 5. Data model

Use Drizzle migrations. Create these tables.

### `vendors`
Payee master, so repeat payees don't get retyped.

```
id                uuid pk
company_name      text not null            -- searchable
contact_person    text
contact_phone     text
address           text
email             text
gstin             text                     -- 15 char, validated if present
udyam_number      text
is_msme           boolean default false
is_active         boolean default true
created_at        timestamptz default now()
updated_at        timestamptz
```

### `recommending_authorities`
Admin-managed list of department heads.

```
id                uuid pk
department        text not null            -- e.g. "Applied AI Studio"
head_name         text not null            -- e.g. "Mr. X Y"
email             text
is_active         boolean default true
created_at        timestamptz default now()
```

### `payment_advices`
The core record. Field names map 1:1 to the paper form.

```
id                      uuid pk
serial_no               text unique not null     -- "MCCIA/2026-27/0001"
financial_year          text not null            -- "2026-27"
status                  text not null            -- 'SUBMITTED' | 'SENT_BACK' | 'APPROVED'

-- Header
form_date               date not null            -- "Date :" on the paper form

-- Payee block ("Name and Address of the Payee")
vendor_id               uuid null references vendors(id)
payee_name              text not null            -- snapshot, NOT a live join
payee_address           text not null
payee_email             text                     -- "E-mail ID :"
payee_contact_person    text
payee_contact_phone     text
payee_gstin             text
payee_udyam_number      text

-- Reference block
po_number               text
po_date                 date
delivery_challan_no     text
delivery_challan_date   date
bill_no                 text not null
bill_date               date not null

-- Money
amount                  numeric(14,2) not null   -- "Amount Rs."
bill_passed_for         numeric(14,2)            -- filled by Admin, nullable on submit

-- Narrative
nature_of_expenditure   text not null
enclosures              text
special_remarks         text

-- Payment
payment_mode            text not null            -- 'NEFT' | 'CASH'
bank_account_no         text                     -- required when NEFT
bank_ifsc               text                     -- required when NEFT
beneficiary_name        text                     -- required when NEFT

-- People
submitted_by_name       text not null
submitted_by_email      text not null
submitted_by_department text not null
recommending_authority_id uuid references recommending_authorities(id) not null

-- Workflow
submitted_at            timestamptz not null
approved_at             timestamptz
approved_by_name        text
sent_back_at            timestamptz
admin_remarks           text                     -- shown to submitter on the edit link
edit_token              text unique              -- null unless status = 'SENT_BACK'
edit_token_expires_at   timestamptz
revision_count          integer default 0

created_at              timestamptz default now()
updated_at              timestamptz
```

**Also add these columns now, nullable, unused in Phase 1.** They exist so the Tally/GST work in Phase 2 needs no migration:

```
taxable_value           numeric(14,2)
cgst_amount             numeric(14,2)
sgst_amount             numeric(14,2)
igst_amount             numeric(14,2)
igst_rcm_amount         numeric(14,2)
is_gst_bill             boolean
tds_section             text
tds_rate                numeric(5,2)
tds_amount              numeric(14,2)
tally_voucher_type      text                     -- 'PURCHASE_GST_REGISTERED' | 'PURCHASE_GST_UNREGISTERED' | 'JOURNAL'
tally_ledger_name       text
tally_exported_at       timestamptz
```

### `attachments`

```
id                  uuid pk
payment_advice_id   uuid not null references payment_advices(id) on delete cascade
doc_type            text not null   -- 'TAX_INVOICE' | 'APPROVAL_BUDGET' | 'PURCHASE_ORDER' | 'DELIVERY_CHALLAN' | 'OTHER'
file_name           text not null
blob_pathname       text not null
blob_url            text not null
size_bytes          integer not null
uploaded_at         timestamptz default now()
```

### `serial_counters`
Prevents duplicate serial numbers under concurrent submits.

```
financial_year   text pk        -- "2026-27"
last_number      integer not null default 0
```

### `audit_log`

```
id                  uuid pk
payment_advice_id   uuid references payment_advices(id)
action              text not null   -- 'SUBMITTED' | 'RESUBMITTED' | 'APPROVED' | 'SENT_BACK' | 'PDF_GENERATED' | 'EXPORTED'
actor               text not null   -- submitter name, or 'ADMIN'
ip_address          text
details             jsonb
created_at          timestamptz default now()
```

---

## 6. Serial number generation

- Format: **`MCCIA/2026-27/0001`** — literal `MCCIA`, Indian financial year, 4-digit zero-padded sequence.
- Financial year runs **1 April → 31 March**. A submission on 28 July 2026 is FY `2026-27`; on 15 Feb 2027 it is still `2026-27`; on 2 April 2027 it becomes `2027-28`.
- The counter **resets to 0001 each financial year**.
- Allocate the number **inside a single Postgres transaction** using `SELECT ... FOR UPDATE` on the `serial_counters` row (upsert the row if the FY doesn't exist yet). Two people clicking Submit at the same instant must never get the same number.
- Assign the serial **only on successful submit**, never on draft or on validation failure — the sequence must have no gaps.
- A resubmission after "send back" **keeps its original serial number** and increments `revision_count`.

Put this in `lib/serial.ts` with unit tests covering: FY boundary on 31 Mar / 1 Apr, first number of a new FY, and concurrent allocation.

---

## 7. The public form — `/`

Single page, sectioned. Every field below maps to the paper form.

**Section 1 — Submitter details**
- Your Name *
- Your Email *
- Your Department *
- Recommending Authority * — dropdown from `recommending_authorities`, showing `Department — Head Name`

**Section 2 — Payee details**
- Payee / Company Name * — **typeahead search against `vendors`**. On selecting an existing vendor, auto-fill address, contact person, phone, email, GSTIN, Udyam. **Auto-filled fields remain editable, and any field that is blank in the vendor record must be filled in by the submitter.** If the name doesn't match an existing vendor, they type it fresh and the record is saved as a snapshot on the advice — do **not** auto-create a vendor from the public form (Admin creates vendors).
- Address *, Contact Person, Contact Phone, E-mail ID, GSTIN, Udyam / MSME No.

**Section 3 — Bill & reference**
- Bill No. *, Bill Date *
- P.O. No., P.O. Date
- Delivery Challan No., Delivery Challan Date
- Amount (Rs.) *
- Nature of Expenditure * (textarea)

**Section 4 — Payment mode**
- Mode * — radio: **NEFT** / **Cash**
- If NEFT: Bank A/c No. *, IFSC Code *, Beneficiary Name * (conditionally required, hidden when Cash)

**Section 5 — Enclosures & remarks**
- Enclosures (textarea)
- Special Remarks (textarea)

**Section 6 — Documents**
- **Tax Invoice — mandatory**
- **Approval / Budget Letter — mandatory**
- Purchase Order — optional
- Delivery Challan — optional
- Other — optional, allow up to 3 files
- **PDF only.** Reject anything else client-side by MIME + extension, and re-verify server-side by reading the first bytes for the `%PDF-` magic number (do not trust the browser's MIME type). Max **10 MB per file**. Show a clear inline error naming the offending file.

### Validation rules (Zod, shared client + server)
- `amount` > 0, max 2 decimals
- `bill_passed_for`, when set by Admin, must be **> 0 and ≤ `amount`**
- `form_date` and `bill_date` cannot be in the future
- GSTIN, when present, matches the standard 15-character pattern
- IFSC matches `^[A-Z]{4}0[A-Z0-9]{6}$`, uppercase-normalised
- Phone: 10 digits, optionally `+91`-prefixed
- Email: valid format
- Trim all strings; store empty optional strings as `NULL`, not `''`

### On submit
1. Validate server-side (never trust the client payload).
2. Upload files to Vercel Blob under `advices/{serial}/{doc_type}-{filename}`.
3. Allocate serial, insert `payment_advices` + `attachments` + `audit_log` in one transaction.
4. Redirect to `/submitted/{serial}` showing: the serial number in large type, a summary of what was submitted, a "what happens next" line, and a **Download PDF** button.
5. If any step after Blob upload fails, delete the uploaded blobs so orphans don't accumulate.

---

## 8. Send-back / resubmit — `/edit/[token]`

- When Admin sends an entry back, generate a cryptographically random `edit_token` (32 bytes, base64url), set `edit_token_expires_at` to **+14 days**, set status `SENT_BACK`, and store `admin_remarks`.
- Admin UI shows a **"Copy edit link"** button. Admin shares that link with the submitter manually. (Automatic email is Phase 2 — do not build it.)
- `/edit/[token]` loads the form pre-filled with the existing values, **shows the Admin's remarks prominently in an amber callout at the top**, and allows editing every field plus replacing/adding attachments.
- On resubmit: status → `SUBMITTED`, `revision_count` += 1, `edit_token` set to `NULL` (single use), `admin_remarks` retained for history, `audit_log` entry `RESUBMITTED`.
- Expired, already-used, or unknown tokens render a friendly "this link is no longer valid, please contact Accounts" page — never a stack trace.

---

## 9. Admin area

### `/admin/login`
Single password field. Rate-limit to 5 attempts per IP per 15 minutes. On success, set the JWT cookie and redirect to `/admin`.

### `/admin` — submissions list
- Table: Serial No. · Form Date · Payee · Amount · Payment Mode · Submitted By · Department · Status · Actions
- Status chips: `SUBMITTED` amber, `SENT_BACK` grey, `APPROVED` green
- Filters: status, date range (on `form_date`), payee (typeahead), department, payment mode, free-text search across serial no. / bill no. / payee
- Sort by any column; default newest first. Server-side pagination, 25 per page.
- Header shows totals for the current filter: count and sum of `amount`.
- Buttons: **Export to Excel**, **New Vendor**, **Manage Authorities**

### `/admin/advice/[id]` — detail
- All fields, read-only, laid out in the same order as the paper form so it's easy to eyeball against the printout.
- Attachments list with file name, size, doc type, and a **View / Download** button per file.
- Editable-by-admin field: **Bill passed for Rs.**
- Actions:
  - **Approve** — sets status `APPROVED`, `approved_at = now()`, `approved_by_name` (Admin types the approving officer's name into a required prompt field — do not hardcode it), writes audit log. Approving requires `bill_passed_for` to be filled.
  - **Send Back** — requires remarks text; generates the edit link.
  - **Download Payment Advice PDF** — enabled only once `APPROVED`.
- Full audit trail displayed at the bottom, newest first.

### `/admin/vendors`
CRUD on the vendor master: company name, contact person, phone, address, email, GSTIN, Udyam, MSME flag, active toggle. Search + pagination. Soft-delete via `is_active` only — never hard-delete a vendor referenced by an advice.

### `/admin/authorities`
CRUD on `recommending_authorities`: department, head name, email, active toggle.

### Attachment access
Store the blob URL but serve every download **through an admin-authenticated route handler** (`/api/admin/attachments/[id]`) that streams the file. The one exception is the submitter's own confirmation page immediately after submit. Do not surface raw blob URLs in admin HTML.

---

## 10. The PDF — exact replica of the paper form

This is the most important deliverable. Finance prints it, and it gets physically signed and filed. It must look like the existing form, not like a redesign.

**Page:** A4 **portrait**, 1.5 cm margins, single page. Font: Helvetica (built into `@react-pdf/renderer`). Black text, thin black table borders — no brand colours, no shading, no decorative elements.

**Header row (three parts, left to right):**
- MCCIA logo (left)
- `MAHRATTA CHAMBER OF COMMERCE INDUSTRIES AND AGRICULTURE` (centre, bold caps), with `Payment Advice` bold beneath it
- `MCCIA / ACTT / PAD / 013` (right, small)

**Immediately below the header, right-aligned:** the serial number in bold — `MCCIA/2026-27/0001`.

**Then a two-date block (this replaces the single "Date :" field on the paper form):**
```
Submitted on : 28/07/2026          Approved on : 30/07/2026
```
Both formatted `DD/MM/YYYY`. `Submitted on` = `submitted_at`. `Approved on` = `approved_at`.

**Body — reproduce the bordered table exactly as on the paper form**, two columns of label/value pairs:

| Left column | Right column |
|---|---|
| Name and Address of the Payee : | P. O. No. / Date · Del. Challan No. / Date |
| E-mail ID : | Bill No. / Date · Amount Rs. |
| Nature of Expenditure : | Bill passed for Rs. · Mode of Payment : Cheque / DD payable at - |
| Enclosures : | Special Remarks : |

Keep the original row structure, borders and label wording. For **Mode of Payment**, print `NEFT` with A/c No., IFSC and Beneficiary Name, or `Cash` — keep the printed label text as it appears on the original form.

**Footer — four signature boxes, exactly as on the paper form:**
```
Submitted by :        Recommended by :      Verified by :         Sanctioned by :
Date :                Date :                Date :                Date :
Signature :           Signature :           Signature :           Signature :
```
- Print the **submitter's name** as text under `Submitted by`, and the **approver's name and approval date** as text under `Recommended by`.
- **Leave every `Signature :` line blank** — all signatures are wet-ink on the printout.

**Overflow:** long values in `Nature of Expenditure`, `Enclosures` or `Special Remarks` must shrink or wrap within their cell. Text must never be clipped or spill outside a border. Test with a 600-character `nature_of_expenditure`.

**Attachments are NOT merged into this PDF.** They stay separate files, downloaded individually. Do not build a merge feature.

Route: `GET /api/admin/advice/[id]/pdf` → `application/pdf`, `Content-Disposition: attachment; filename="MCCIA-2026-27-0001.pdf"` (slashes replaced with hyphens in the filename). Write an audit log entry on generation.

---

## 11. Excel export

`GET /api/admin/export` — takes the same filter params as the list view, returns `.xlsx`.

- One row per payment advice, **all** fields as columns, in this order: Serial No., Financial Year, Status, Form Date, Submitted On, Approved On, Approved By, Submitted By, Submitter Email, Department, Recommending Authority, Payee Name, Payee Address, Payee GSTIN, Payee Udyam, Payee Email, Contact Person, Contact Phone, Bill No., Bill Date, PO No., PO Date, Delivery Challan No., Delivery Challan Date, Nature of Expenditure, Amount, Bill Passed For, Payment Mode, Bank A/c No., IFSC, Beneficiary Name, Enclosures, Special Remarks, Revision Count.
- Dates as **real Excel date cells** in `DD-MM-YYYY`, not strings. Amounts as **numbers**, not text — Finance will sum them.
- Freeze the header row, bold it, auto-fit column widths.
- Filename: `MCCIA-Payment-Advices-{YYYY-MM-DD}.xlsx`. Write an audit log entry.

This export is what Finance uses for Tally entry today. Keep the column order stable — Phase 2's Tally XML mapping will be built on top of it.

---

## 12. Acceptance criteria for Phase 1

- [ ] Anyone can open `/` with no login and submit a complete Payment Advice
- [ ] Tax Invoice and Approval/Budget attachments are enforced as mandatory; non-PDF and >10 MB files are rejected both client- and server-side
- [ ] Vendor typeahead auto-fills saved payee details and leaves them editable
- [ ] Serial numbers are unique, gapless, correctly formatted, and reset on 1 April
- [ ] Admin can log in; all `/admin/*` routes 302 to login when unauthenticated
- [ ] Admin can filter, sort and paginate submissions, and see totals for the current filter
- [ ] Admin can approve (after entering approver name and Bill passed for) and send back with remarks
- [ ] The edit link re-opens a sent-back form pre-filled, shows the remarks, works exactly once, and expires
- [ ] The generated PDF is a visually faithful single-page A4 replica of the paper form, carrying the serial number, both dates, the approver's name, and blank signature lines
- [ ] Excel export opens cleanly in Excel with correct date and number types
- [ ] Every state change is written to `audit_log`
- [ ] Zero secrets in the repo; `README.md` documents every env var

---

## 13. Out of scope for Phase 1 — do NOT build

Listed only so the schema and structure accommodate them later:

- **Phase 2:** TallyPrime XML voucher export (`Purchase GST Register` / `Purchase GST Unregistered` / `Journal`), GST breakup capture (CGST, SGST, IGST, IGST on RCM), TDS fields, Tally ledger master sync and ledger dropdowns, `tally_exported_at` marking
- **Phase 3:** Automated email notifications on submit / approve / send-back, Google Workspace SSO for submitters, per-user submission history, analytics dashboard, multi-step approval routing to the Recommending Authority as an in-app actor

If I ask for any of these mid-build, confirm with me that we're moving past Phase 1 before you start.

---

## 14. Things I have assumed — correct me if wrong

1. `form_date` defaults to the submission date but stays editable by the submitter.
2. Approving requires `bill_passed_for` to be filled, and it cannot exceed `amount`.
3. The approver's name is typed in by Admin at approval time rather than being a fixed value.
4. "Other" attachments are capped at 3 files.
5. The edit link expires after 14 days.
6. Vendors are created only by Admin, never auto-created from a public submission.