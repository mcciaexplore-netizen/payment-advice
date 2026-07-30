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
} from "drizzle-orm/pg-core";

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

  // Narrative
  natureOfExpenditure: text("nature_of_expenditure").notNull(),
  enclosures: text("enclosures"),
  specialRemarks: text("special_remarks"),

  // Payment
  paymentMode: text("payment_mode").notNull(), // 'NEFT' | 'CASH'
  bankAccountNo: text("bank_account_no"),
  bankIfsc: text("bank_ifsc"),
  beneficiaryName: text("beneficiary_name"),

  // People
  submittedByName: text("submitted_by_name").notNull(),
  submittedByEmail: text("submitted_by_email").notNull(),
  submittedByDepartment: text("submitted_by_department").notNull(),
  recommendingAuthorityId: uuid("recommending_authority_id")
    .references(() => recommendingAuthorities.id)
    .notNull(),
  // Printed under "Verified by" on the footer signature box — collected
  // upfront so the PDF is immediately downloadable and printable for
  // physical signing, before admin approval. Not the same thing as
  // `verifiedBy` below (Finance's admin-side verification stage).
  verifiedByName: text("verified_by_name").notNull(),

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
  sanctionedAt: timestamp("sanctioned_at", { withTimezone: true }),
  sanctionedBy: text("sanctioned_by"),

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

export const serialCounters = pgTable("serial_counters", {
  financialYear: text("financial_year").primaryKey(),
  lastNumber: integer("last_number").default(0).notNull(),
});

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
