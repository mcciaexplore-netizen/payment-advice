import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  date,
  numeric,
  integer,
  jsonb,
  unique,
  primaryKey,
} from "drizzle-orm/pg-core";

/** Real per-person Admin logins, replacing the old shared ADMIN_PASSWORD.
 * `role` gates only the default landing filter (Payment-Advice/Cash-Voucher/
 * combined) — NOT a backend authorization wall; every logged-in user can
 * still see everything via the "All" tab/filter. See AGENT_HANDOFF.md. */
export const adminUsers = pgTable("admin_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull(), // 'PAYMENT_ADVICE' | 'CASH_VOUCHER' | 'ALL'
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

export const vendors = pgTable("vendors", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyName: text("company_name").notNull(),
  contactPerson: text("contact_person"),
  contactPhone: text("contact_phone"),
  address: text("address"),
  email: text("email"),
  gstin: text("gstin"),
  udyamNumber: text("udyam_number"),
  isMsme: boolean("is_msme").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

/** The pool of actual approvers (people, or the shared "DG" entity) — not
 * departments. Assigned per staff member via staff_authority_options, not
 * implied by which department a submitter belongs to. */
export const recommendingAuthorities = pgTable("recommending_authorities", {
  id: uuid("id").primaryKey().defaultRandom(),
  authorityName: text("authority_name").notNull(),
  // Nullable — this column has existed since migration 0003 but was never
  // populated until scripts/backfill-staff-authority-emails.ts. Drives
  // notifyAuthorityApproval()'s recipient; null falls back to preview mode
  // for that specific authority rather than sending live.
  email: text("email"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** The roster of people allowed to submit — matched against as the
 * submitter types their name, to drive the Recommending Authority
 * auto-fill. Not an enforced allowlist: an unmatched name can still submit,
 * just without auto-fill. */
export const staffMembers = pgTable("staff_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  fullName: text("full_name").notNull(),
  // Nullable — backfilled by scripts/backfill-staff-authority-emails.ts for
  // staff matched against MCCIA's authoritative name/email list; not every
  // staff member has a known email. Drives the "Your Email" auto-fill on
  // the public form and is the single source of truth for resolving any
  // staff member's (including Verifier/Sanctioner) email by name.
  email: text("email"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

/** Which recommending authorities apply to which staff member, in order
 * (sort_order 1 = first/default option, 2 = second option). A staff member
 * with exactly one row here gets that authority pre-selected on the public
 * form; with two, both are offered as radio options. */
export const staffAuthorityOptions = pgTable(
  "staff_authority_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffMemberId: uuid("staff_member_id")
      .notNull()
      .references(() => staffMembers.id, { onDelete: "cascade" }),
    recommendingAuthorityId: uuid("recommending_authority_id")
      .notNull()
      .references(() => recommendingAuthorities.id),
    sortOrder: integer("sort_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [unique().on(table.staffMemberId, table.recommendingAuthorityId)],
);

export const paymentAdvices = pgTable("payment_advices", {
  id: uuid("id").primaryKey().defaultRandom(),
  serialNo: text("serial_no").notNull().unique(),
  financialYear: text("financial_year").notNull(),
  status: text("status").notNull(), // 'SUBMITTED' | 'SENT_BACK' | 'APPROVED'

  // Header
  formDate: date("form_date").notNull(),

  // Payee block
  vendorId: uuid("vendor_id").references(() => vendors.id),
  payeeName: text("payee_name").notNull(),
  payeeAddress: text("payee_address").notNull(),
  payeeEmail: text("payee_email"),
  payeeContactPerson: text("payee_contact_person"),
  payeeContactPhone: text("payee_contact_phone"),
  payeeGstin: text("payee_gstin"),
  payeeUdyamNumber: text("payee_udyam_number"),

  // Reference block
  poNumber: text("po_number"),
  poDate: date("po_date"),
  deliveryChallanNo: text("delivery_challan_no"),
  deliveryChallanDate: date("delivery_challan_date"),
  billNo: text("bill_no").notNull(),
  billDate: date("bill_date").notNull(),

  // Money
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  billPassedFor: numeric("bill_passed_for", { precision: 14, scale: 2 }),
  // Basic/GST split — NEFT-only (see AGENT_HANDOFF.md). Nullable: existing
  // NEFT submissions from before this split only ever have `amount` (the
  // Total); Cash Voucher never populates these at all. `amount` stays the
  // auto-calculated Basic + GST sum for NEFT going forward — it remains the
  // single source every other reader (PDF, Excel, bill_passed_for's <=
  // check) uses, unchanged.
  basicAmount: numeric("basic_amount", { precision: 14, scale: 2 }),
  gstAmount: numeric("gst_amount", { precision: 14, scale: 2 }),
  // Running total of payment_entries recorded against this advice — cached,
  // not derived via SUM() at render time (same reasoning as every other
  // derived-vs-cached decision in this schema: avoids an aggregate query on
  // every list/tab render). Updated atomically, in the same transaction as
  // each payment_entries insert. NEFT-only in practice: Cash's "Mark
  // Payment Done" never touches this column, so it stays "0.00" forever for
  // Cash rows — this is what lets the admin tabs tell a Cash-paid row and
  // an NEFT-paid row apart without a separate flag (see lib/admin/filters.ts).
  totalPaid: numeric("total_paid", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),

  // Narrative
  natureOfExpenditure: text("nature_of_expenditure").notNull(),
  enclosures: text("enclosures"),
  specialRemarks: text("special_remarks"),

  // Advance Payment — a third top-level option on the public form, but NOT
  // a third payment_mode value: an advance still routes to the existing
  // NEFT (Payment Advice) or CASH (Cash Voucher) pipeline/dashboard exactly
  // as a regular submission would, just flagged. See AGENT_HANDOFF.md.
  // Settlement (reconciling actual spend against the advance afterward) is
  // explicitly a separate future feature — nothing here supports it yet.
  isAdvance: boolean("is_advance").default(false).notNull(),
  // Own gapless series (ADV/MCCIA/<FY>/NNNN via serial_counters' ADVANCE
  // row), allocated only when isAdvance = true, regardless of NEFT/CASH
  // sub-route — one shared counter, not two. Becomes the primary display
  // number wherever this advance is shown, superseding serial_no/
  // cash_voucher_no the same way cash_voucher_no supersedes serial_no for
  // Cash — see lib/advice/document-identity.ts.
  advanceNo: text("advance_no"),
  // Free-text overall reason for the advance — distinct from the itemized
  // advance_particulars breakdown below (which categorizes *what* by preset
  // type; this captures *why*). Mirrored into nature_of_expenditure (same
  // dual-representation pattern cash_voucher_items already uses) so every
  // existing reader of that NOT NULL column keeps working unchanged.
  purposeOfAdvance: text("purpose_of_advance"),
  // Self-declared by the submitter, not system-verified — no Settlement
  // tracking exists yet to verify against (explicitly out of scope).
  previousPendingAdvanceAmount: numeric("previous_pending_advance_amount", {
    precision: 14,
    scale: 2,
  }),
  previousPendingAdvanceSince: date("previous_pending_advance_since"),

  // Payment
  paymentMode: text("payment_mode").notNull(), // 'NEFT' | 'CASH'
  bankAccountNo: text("bank_account_no"),
  bankIfsc: text("bank_ifsc"),
  beneficiaryName: text("beneficiary_name"),
  // Own gapless series (CASH/MCCIA/<FY>/NNNN, via serial_counters' CASH_VOUCHER
  // row), allocated only for payment_mode = 'CASH', at submission time,
  // alongside serial_no. serial_no stays the DB/audit-log/Excel identifier
  // for every submission regardless of mode; this is purely what prints on
  // the Cash Voucher PDF.
  cashVoucherNo: text("cash_voucher_no"),

  // People
  submittedByName: text("submitted_by_name").notNull(),
  submittedByEmail: text("submitted_by_email").notNull(),
  submittedByDepartment: text("submitted_by_department").notNull(),
  recommendingAuthorityId: uuid("recommending_authority_id")
    .references(() => recommendingAuthorities.id)
    .notNull(),

  // Workflow
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedByName: text("approved_by_name"),
  sentBackAt: timestamp("sent_back_at", { withTimezone: true }),
  adminRemarks: text("admin_remarks"),
  editToken: text("edit_token").unique(),
  editTokenExpiresAt: timestamp("edit_token_expires_at", {
    withTimezone: true,
  }),
  revisionCount: integer("revision_count").default(0).notNull(),

  // Recommending Authority approval — the specific authority chosen on the
  // form must approve before Admin can. Derived state, not a status enum
  // value: "waiting on authority" = status SUBMITTED && authorityApprovedAt
  // null; "ready for Finance" = status SUBMITTED && authorityApprovedAt set.
  // Reset to null (and authorityToken reissued) on every resubmission, since
  // a changed submission needs fresh authority review regardless of who
  // sent it back.
  authorityApprovedAt: timestamp("authority_approved_at", {
    withTimezone: true,
  }),
  authorityRejectedAt: timestamp("authority_rejected_at", {
    withTimezone: true,
  }),
  authorityRemarks: text("authority_remarks"),
  // Unlike editToken, this is NOT single-use/nulled after action — the
  // authority-approval page stays reachable at the same link afterward to
  // show the read-only "already approved/sent back" banner.
  authorityToken: text("authority_token").unique(),
  authorityTokenExpiresAt: timestamp("authority_token_expires_at", {
    withTimezone: true,
  }),

  // Finance Verification + Sanctioning pipeline — runs after Authority
  // approval, for both NEFT and Cash. All three stages happen inside the
  // single shared Admin login (no individual accounts), so each stage
  // records WHICH named person (from a small hardcoded list, not a
  // CRUD-managed table — see lib/validation/payment-advice.ts) did it.
  // Derived state, not new status values, same rationale as the authority
  // fields above. Sanctioning is the new final gate before payment and
  // folds into what the old free-text "Approve" action used to mean: it
  // also sets `status` to APPROVED and dual-writes `approvedAt`/
  // `approvedByName` so every existing reader of those two fields (Excel
  // export, the Payment Advice PDF header, the admin-gated PDF routes)
  // keeps working unchanged. Reset to null on every resubmission, same as
  // the authority fields.
  financeReceivedAt: timestamp("finance_received_at", { withTimezone: true }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  verifiedBy: text("verified_by"),
  // Retired as an active pipeline step (see AGENT_HANDOFF.md) — sanctioning
  // now happens physically/offline. Columns kept, not dropped: preserves
  // historical data and the "Correct name" audit trail for rows sanctioned
  // before the retirement. No new row will ever set these going forward.
  sanctionedAt: timestamp("sanctioned_at", { withTimezone: true }),
  sanctionedBy: text("sanctioned_by"),
  // Replaces Sanction as the terminal action. "Ready for Payment" itself is
  // derived (verified_at set, payment_done_at null — no new column needed),
  // same "derive from timestamps" convention as every other pipeline stage
  // in this table. Auto-attributed from the logged-in admin_users.full_name
  // at the time of the click, same snapshot-not-FK pattern as verified_by/
  // sanctioned_by.
  paymentDoneAt: timestamp("payment_done_at", { withTimezone: true }),
  paymentDoneBy: text("payment_done_by"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),

  // --- Phase 2 fields: nullable, unused in Phase 1 ---
  taxableValue: numeric("taxable_value", { precision: 14, scale: 2 }),
  cgstAmount: numeric("cgst_amount", { precision: 14, scale: 2 }),
  sgstAmount: numeric("sgst_amount", { precision: 14, scale: 2 }),
  igstAmount: numeric("igst_amount", { precision: 14, scale: 2 }),
  igstRcmAmount: numeric("igst_rcm_amount", { precision: 14, scale: 2 }),
  isGstBill: boolean("is_gst_bill"),
  tdsSection: text("tds_section"),
  tdsRate: numeric("tds_rate", { precision: 5, scale: 2 }),
  tdsAmount: numeric("tds_amount", { precision: 14, scale: 2 }),
  tallyVoucherType: text("tally_voucher_type"),
  tallyLedgerName: text("tally_ledger_name"),
  tallyExportedAt: timestamp("tally_exported_at", { withTimezone: true }),
});

export const attachments = pgTable("attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  paymentAdviceId: uuid("payment_advice_id")
    .notNull()
    .references(() => paymentAdvices.id, { onDelete: "cascade" }),
  docType: text("doc_type").notNull(), // 'TAX_INVOICE' | 'APPROVAL_BUDGET' | 'PURCHASE_ORDER' | 'DELIVERY_CHALLAN' | 'OTHER'
  fileName: text("file_name").notNull(),
  blobPathname: text("blob_pathname").notNull(),
  blobUrl: text("blob_url").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** Itemised Nature of Expenditure rows for Cash Payment Vouchers only. */
export const cashVoucherItems = pgTable("cash_voucher_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  paymentAdviceId: uuid("payment_advice_id")
    .notNull()
    .references(() => paymentAdvices.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** Itemised Particulars breakdown for Advance Payment submissions only
 * (isAdvance = true), regardless of NEFT/CASH sub-route — same free-text
 * description + amount shape as cash_voucher_items (originally a category
 * dropdown + conditional "Other" text field; simplified to match Cash
 * Voucher's plain description+amount pattern exactly, see AGENT_HANDOFF.md). */
export const advanceParticulars = pgTable("advance_particulars", {
  id: uuid("id").primaryKey().defaultRandom(),
  paymentAdviceId: uuid("payment_advice_id")
    .notNull()
    .references(() => paymentAdvices.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  sortOrder: integer("sort_order").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

/**
 * Multi-part payment tracking — NEFT (Payment Advice) only. Cash Voucher's
 * single-action "Mark Payment Done" (POST .../payment-done) never inserts
 * here; see AGENT_HANDOFF.md for the full model. One row per actual
 * disbursement Finance records against an advice — e.g. Basic Amount paid
 * now, GST portion paid weeks later once recovered via GST return. `amount`
 * summed across all rows for an advice is mirrored, atomically, into
 * payment_advices.total_paid.
 */
export const paymentEntries = pgTable("payment_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  paymentAdviceId: uuid("payment_advice_id")
    .notNull()
    .references(() => paymentAdvices.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  remarks: text("remarks").notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
  // Auto-attributed from the logged-in admin session, same snapshot-not-FK
  // pattern as verified_by/sanctioned_by/payment_done_by.
  paidBy: text("paid_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

/** One row per (financial year, series) pair. 'PAYMENT_ADVICE' is the
 * original series (MCCIA/<FY>/NNNN, every submission); 'CASH_VOUCHER' is the
 * independent series (CASH/MCCIA/<FY>/NNNN, CASH-mode submissions only).
 * 'ADVANCE' (ADV/MCCIA/<FY>/NNNN) is a third independent series for
 * isAdvance = true submissions — one shared counter regardless of whether
 * the advance routes to NEFT or Cash, not two separate ADV series. All
 * three allocated via the same SELECT ... FOR UPDATE gapless pattern in
 * lib/serial.ts — this is one mechanism serving three series, not three
 * copies of it. */
export const serialCounters = pgTable(
  "serial_counters",
  {
    financialYear: text("financial_year").notNull(),
    series: text("series").notNull().default("PAYMENT_ADVICE"),
    lastNumber: integer("last_number").default(0).notNull(),
  },
  (table) => [primaryKey({ columns: [table.financialYear, table.series] })],
);

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  paymentAdviceId: uuid("payment_advice_id").references(
    () => paymentAdvices.id,
  ),
  action: text("action").notNull(), // 'SUBMITTED' | 'RESUBMITTED' | 'APPROVED' | 'SENT_BACK' | 'PDF_GENERATED' | 'EXPORTED'
  actor: text("actor").notNull(),
  ipAddress: text("ip_address"),
  details: jsonb("details"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
