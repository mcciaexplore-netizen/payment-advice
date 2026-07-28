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

export const recommendingAuthorities = pgTable("recommending_authorities", {
  id: uuid("id").primaryKey().defaultRandom(),
  department: text("department").notNull(),
  headName: text("head_name").notNull(),
  email: text("email"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

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
