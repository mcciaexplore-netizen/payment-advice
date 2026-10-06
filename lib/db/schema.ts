import {
  check,
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
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/** Real per-person Finance and Recommending Authority logins. Finance roles
 * use the admin area; AUTHORITY users are strictly scoped to the linked
 * recommending-authority queue.
 *
 * `role`/`recommendingAuthorityId` below are DEPRECATED as of the
 * multi-role migration (see `adminUserRoles`) — kept in place, nullable-
 * in-spirit-but-not-in-schema, deliberately not dropped yet. All new code
 * must read roles from `admin_user_roles`, never from these two columns.
 * See AGENT_HANDOFF.md for why they were kept rather than dropped. */
export const adminUsers = pgTable("admin_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  /** @deprecated Superseded by `adminUserRoles`. Retained only as a
   * pre-migration historical snapshot; no code should read this anymore. */
  role: text("role").notNull(), // 'PAYMENT_ADVICE' | 'CASH_VOUCHER' | 'ALL' | 'AUTHORITY'
  /** @deprecated Superseded by `adminUserRoles.recommendingAuthorityId`. */
  recommendingAuthorityId: uuid("recommending_authority_id").references(
    () => recommendingAuthorities.id,
  ),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

/** One row per (admin_user, role) grant — replaces admin_users' old single
 * `role`/`recommending_authority_id` columns with a proper one-to-many
 * structure, so one login (e.g. Chintamani's) can hold both an AUTHORITY
 * grant (scoped to his own recommending_authority_id) and an ALL grant
 * (full Finance Admin access) without a second account. `unique(admin_user_id,
 * role)` matches the real-world rule this was built for: a person can hold
 * each role at most once, but multiple different roles simultaneously.
 * `recommendingAuthorityId` is only ever set on the row where `role =
 * 'AUTHORITY'` — every other role's row leaves it null. */
export const adminUserRoles = pgTable(
  "admin_user_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adminUserId: uuid("admin_user_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // 'PAYMENT_ADVICE' | 'CASH_VOUCHER' | 'ALL' | 'AUTHORITY'
    recommendingAuthorityId: uuid("recommending_authority_id").references(
      () => recommendingAuthorities.id,
    ),
    // Exact payment_advices.branch / submitted_by_department value for
    // BRANCH and DEPARTMENT grants; Cash Receipt's assigned receipt branch
    // for CASH_RECEIPT. Null for other roles.
    scopeValue: text("scope_value"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique().on(table.adminUserId, table.role),
    check(
      "admin_user_roles_scope_value_check",
      sql`(${table.role} in ('BRANCH', 'DEPARTMENT', 'CASH_RECEIPT') and ${table.scopeValue} is not null) or (${table.role} not in ('BRANCH', 'DEPARTMENT', 'CASH_RECEIPT') and ${table.scopeValue} is null)`,
    ),
  ],
);

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

/** A vendor can legitimately have more than one valid bank account (different
 * branches, a bank change over time) — a proper one-to-many table, not
 * single bank columns on `vendors`. Column names/types deliberately mirror
 * `payment_advices.bank_account_no`/`bank_ifsc`/`beneficiary_name` exactly
 * (same `text`, not re-typed) so values can move between the two without
 * conversion. Deduplicated on (vendor, account, IFSC) — the same
 * beneficiary name typo'd two different ways against an otherwise-identical
 * account is still one bank account, not two rows; `beneficiaryName` here
 * just reflects whichever submission most recently used it. `sourceAdviceId`
 * is traceability only (which submission first captured this combination),
 * not a hard requirement — nullable so a future admin-entered account
 * doesn't need a fabricated advice to point at. */
export const vendorBankAccounts = pgTable(
  "vendor_bank_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    bankAccountNo: text("bank_account_no").notNull(),
    bankIfsc: text("bank_ifsc").notNull(),
    beneficiaryName: text("beneficiary_name").notNull(),
    sourceAdviceId: uuid("source_advice_id").references(() => paymentAdvices.id),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    // NULL/empty (the default for every account) = visible to everyone, as
    // before. Populated = only a submitter whose typed "Your Email"
    // case-insensitively matches one of these may see or use this specific
    // account; everyone else must see this vendor as if it has zero
    // accounts on file. Enforced in the GET /api/vendors/[id]/bank-accounts
    // query itself, never filtered after the fact client-side.
    restrictedToEmails: text("restricted_to_emails").array(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [unique().on(table.vendorId, table.bankAccountNo, table.bankIfsc)],
);

/** The pool of actual recommending officers (people, or the shared "DG" entity) — not
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

/** A submitter-initiated request to add a new vendor, filed alongside a
 * Payment Advice submission rather than blocking on it - the PA can be
 * fully submitted (vendor_id null, pending_vendor_request_id set here)
 * while Finance reviews this request separately. Stage is derived from the
 * nullable timestamp columns (approved_at / sent_back_at / neither =
 * pending), same convention as the rest of the app - no status enum. */
export const vendorRequests = pgTable("vendor_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestedName: text("requested_name").notNull(),
  requestedAddress: text("requested_address").notNull(),
  requestedGstin: text("requested_gstin"),
  // MICRO | SMALL | MEDIUM | NOT_REGISTERED | UNKNOWN - free-ish, not a DB
  // enum, since the submitter is self-reporting what they believe is true,
  // not something this app can verify. Defaults to UNKNOWN at the
  // application layer when not provided (see lib/validation/vendor-request.ts).
  msmeStatus: text("msme_status"),
  // Blob URL for whichever document the submitter attached (Udyam
  // Registration Certificate, or a signed non-MSME declaration) - optional,
  // not a submission gate. Same direct-to-Blob pattern as every other
  // attachment in this app, but stored here directly rather than in the
  // shared `attachments` table since it belongs to this request, not to a
  // specific payment_advices row's document set.
  msmeDocumentUrl: text("msme_document_url"),
  msmeDocumentType: text("msme_document_type"), // 'UDYAM_CERTIFICATE' | 'NON_MSME_DECLARATION'
  // The vendor's own email - mandatory (2026-10-01 revision), since the app
  // now sends the MSME request email itself rather than handing the
  // submitter a mailto: link. Not optional like requestedGstin: there is no
  // real-document-already-in-hand path that needs a vendor email, but every
  // genuinely-new-vendor path does.
  requestedVendorEmail: text("requested_vendor_email").notNull(),
  requestedByName: text("requested_by_name").notNull(),
  requestedByEmail: text("requested_by_email").notNull(),
  // Set when the app's own MSME request email send succeeds - lets Finance
  // see whether the ball is in the vendor's court. Null until a submitter
  // clicks "Send Email" on the request panel; never set for a request where
  // they skipped straight to uploading a document they already had.
  msmeEmailSentAt: timestamp("msme_email_sent_at", { withTimezone: true }),
  // The SMTP/provider's message id - same traceability pattern as every
  // other email this app sends (see lib/email/notify.ts's `dispatch()`).
  msmeEmailMessageId: text("msme_email_message_id"),
  paymentAdviceId: uuid("payment_advice_id")
    .notNull()
    .references((): AnyPgColumn => paymentAdvices.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedBy: text("approved_by"),
  // The real vendor record created/linked once approved - null until then.
  approvedVendorId: uuid("approved_vendor_id").references(() => vendors.id),
  sentBackAt: timestamp("sent_back_at", { withTimezone: true }),
  sentBackBy: text("sent_back_by"),
  sentBackRemarks: text("sent_back_remarks"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const paymentAdvices = pgTable("payment_advices", {
  id: uuid("id").primaryKey().defaultRandom(),
  serialNo: text("serial_no").notNull().unique(),
  financialYear: text("financial_year").notNull(),
  status: text("status").notNull(), // 'SUBMITTED' | 'SENT_BACK' | 'REJECTED' | 'APPROVED'

  // Header
  formDate: date("form_date").notNull(),

  // Payee block
  vendorId: uuid("vendor_id").references(() => vendors.id),
  // Set instead of vendorId when the submitter requested a new vendor be
  // added alongside this submission (vendorId stays null until Finance
  // approves the request and backfills it - see lib/advice/vendor-requests.ts).
  pendingVendorRequestId: uuid("pending_vendor_request_id").references((): AnyPgColumn => vendorRequests.id),
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
  // A single independent confirmation flag for regular NEFT GST recovery.
  // This deliberately does not affect the main payable/payment lifecycle;
  // Advance and Cash submissions never expose or set it.
  gstSettled: boolean("gst_settled").default(false).notNull(),
  gstSettledBy: text("gst_settled_by"),
  gstSettledAt: timestamp("gst_settled_at", { withTimezone: true }),
  // Finance's post-verification Arrears/TDS calculation. Nullable so
  // historical rows (and Cash Vouchers, which never use this calculator)
  // remain valid without a backfill. `payable_amount` is the immutable cap
  // used by NEFT payment_entries once the first payment is recorded.
  arrearsAmount: numeric("arrears_amount", { precision: 14, scale: 2 }),
  arrearsTdsPercent: numeric("arrears_tds_percent", { precision: 5, scale: 2 }),
  currentTdsPercent: numeric("current_tds_percent", { precision: 5, scale: 2 }),
  payableAmount: numeric("payable_amount", { precision: 14, scale: 2 }),
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
  bankName: text("bank_name"),
  // True only when the Gemini invoice auto-fill extracted a bank account
  // no./IFSC from the invoice itself that differs from the vendor's known
  // system-of-record bank account (which always wins and is what actually
  // gets saved above) — see lib/invoice-autofill.ts's bankDetailsMismatch().
  // A real signal worth Finance's attention: it can mean the invoice is
  // stale, or a genuine vendor-bank-change/fraud red flag. Never true for a
  // submission that didn't go through invoice auto-fill at all.
  bankDetailsMismatch: boolean("bank_details_mismatch").default(false).notNull(),
  // Own gapless series (CASH/MCCIA/<FY>/NNNN, via serial_counters' CASH_VOUCHER
  // row), allocated only for regular payment_mode = 'CASH' submissions.
  // serial_no mirrors this value and acts as the canonical reference.
  cashVoucherNo: text("cash_voucher_no"),

  // People
  submittedByName: text("submitted_by_name").notNull(),
  submittedByEmail: text("submitted_by_email").notNull(),
  submittedByDepartment: text("submitted_by_department").notNull(),
  // Required by shared validation for all new submissions; nullable in the
  // database so pre-0018 historical rows remain valid without backfilling.
  branch: text("branch"),
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
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  rejectedBy: text("rejected_by"),
  rejectionRemarks: text("rejection_remarks"),

  // Recommending Authority recommendation — the specific authority chosen on the
  // form must recommend before Admin can. Derived state, not a status enum
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
  // authority recommendation page stays reachable at the same link afterward to
  // show the read-only "already recommended/sent back" banner.
  authorityToken: text("authority_token").unique(),
  authorityTokenExpiresAt: timestamp("authority_token_expires_at", {
    withTimezone: true,
  }),

  // Finance Verification + Sanctioning pipeline — runs after Authority
  // recommendation, for both NEFT and Cash. All three stages happen inside the
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
  billNo: text("bill_no"),
  billDate: date("bill_date"),
  attachmentId: uuid("attachment_id").references(() => attachments.id, {
    onDelete: "set null",
  }),
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
  // Optional in the UI/API. Kept NOT NULL for backward schema stability;
  // an omitted remark is stored as the empty string.
  remarks: text("remarks").notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
  // Auto-attributed from the logged-in admin session, same snapshot-not-FK
  // pattern as verified_by/sanctioned_by/payment_done_by.
  paidBy: text("paid_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

/** Forwarded instruments are stored separately from payment requests so
 * they do not enter the existing disbursement or recommendation workflows. */
export const forwardingMemos = pgTable(
  "forwarding_memos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Own independent gapless series (FM/MCCIA/<FY>/NNNN), allocated via the
    // same lib/serial.ts SELECT ... FOR UPDATE primitive as the other three
    // series — see allocateForwardingMemoNumber(). Never reused, same as
    // serial_no/cash_voucher_no/advance_no.
    serialNo: text("serial_no").notNull().unique(),
    financialYear: text("financial_year").notNull(),
    memoDate: date("memo_date").notNull(),
    partyName: text("party_name").notNull(),
    partyAddress: text("party_address").notNull(),
    purpose: text("purpose").notNull(),
    billNo: text("bill_no"),
    billDate: date("bill_date"),
    instrumentMode: text("instrument_mode", { enum: ["CHEQUE", "DD"] }).notNull(),
    instrumentNo: text("instrument_no").notNull(),
    instrumentDate: date("instrument_date").notNull(),
    drawnOnBank: text("drawn_on_bank").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    submittedByName: text("submitted_by_name").notNull(),
    // Optional - not wired to send anything yet (no notification code exists
    // for Forwarding Memos), captured now for a future receipt/confirmation
    // email once that's built.
    submittedByEmail: text("submitted_by_email"),
    // Single-step acknowledgment (not a staged pipeline like Cash Voucher) -
    // both null until a Finance Admin marks it received; both set together.
    receivedAt: timestamp("received_at", { withTimezone: true }),
    receivedBy: text("received_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("forwarding_memos_instrument_mode_check", sql`${table.instrumentMode} in ('CHEQUE', 'DD')`),
    check("forwarding_memos_amount_positive_check", sql`${table.amount} > 0`),
  ],
);

/** One row per (financial year, series) pair. 'PAYMENT_ADVICE' is the
 * regular-NEFT series (MCCIA/<FY>/NNNN); 'CASH_VOUCHER' is the independent
 * regular-Cash series (CASH/MCCIA/<FY>/NNNN).
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

/** Own independent gapless series per branch (CR/<branchCode>/<FY>/NNNN),
 * allocated via the same lib/serial.ts SELECT ... FOR UPDATE primitive as
 * the other four series, see allocateCashReceiptNumber(). Uses the
 * existing serialCounters table (series = "CASH_RECEIPT:<branchCode>", one
 * row per branch per financial year), not a separate counters table, same
 * allocation mechanism, just a per-branch series key. */
export const cashReceipts = pgTable(
  "cash_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serialNo: text("serial_no").notNull().unique(),
    financialYear: text("financial_year").notNull(),
    branch: text("branch").notNull(),
    receiptDate: date("receipt_date").notNull(),
    partyName: text("party_name").notNull(),
    gstin: text("gstin"),
    items: jsonb("items").$type<Array<{ particulars: string; copies: number; price: string; amount: string; billNo?: string; billDate?: string }>>().notNull(),
    total: numeric("total", { precision: 14, scale: 2 }).notNull(),
    // The real identity behind this receipt - who was actually logged in at
    // submit time, not a free-text name. Drives server-side access control
    // (a branch account may only view/download receipts where this matches
    // their own session, never another branch member's, even within the
    // same branch) and the Team Dashboard's own "Cash Receipts" list.
    issuedByUserId: uuid("issued_by_user_id").notNull().references(() => adminUsers.id),
    // Display snapshots of the issuer at submit time - submittedByName kept
    // for the printed receipt/listing without a join, submittedByEmail now
    // populated from the session's real admin_users.email (previously
    // nothing populated it; the form still collects no separate email).
    submittedByName: text("submitted_by_name").notNull(),
    submittedByEmail: text("submitted_by_email"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "cash_receipts_branch_check",
      sql`${table.branch} in ('SB Road Office', 'Tilak Road Office', 'Hadapsar Office', 'Bhosari Office', 'Ahilyanagar Office')`,
    ),
    check("cash_receipts_total_positive_check", sql`${table.total} > 0`),
  ],
);

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  paymentAdviceId: uuid("payment_advice_id").references(
    () => paymentAdvices.id,
  ),
  forwardingMemoId: uuid("forwarding_memo_id").references(() => forwardingMemos.id),
  vendorRequestId: uuid("vendor_request_id").references(() => vendorRequests.id),
  cashReceiptId: uuid("cash_receipt_id").references(() => cashReceipts.id),
  action: text("action").notNull(), // 'SUBMITTED' | 'RESUBMITTED' | 'APPROVED' | 'SENT_BACK' | 'PDF_GENERATED' | 'EXPORTED' | 'VENDOR_REQUEST_SUBMITTED' | 'VENDOR_REQUEST_APPROVED' | 'VENDOR_REQUEST_SENT_BACK' | 'VENDOR_MSME_EMAIL_SENT' | 'CASH_RECEIPT_SUBMITTED' | 'CASH_RECEIPT_PDF_GENERATED'
  actor: text("actor").notNull(),
  ipAddress: text("ip_address"),
  details: jsonb("details"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
