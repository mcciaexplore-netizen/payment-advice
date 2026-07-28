CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_advice_id" uuid NOT NULL,
	"doc_type" text NOT NULL,
	"file_name" text NOT NULL,
	"blob_pathname" text NOT NULL,
	"blob_url" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_advice_id" uuid,
	"action" text NOT NULL,
	"actor" text NOT NULL,
	"ip_address" text,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_advices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"serial_no" text NOT NULL,
	"financial_year" text NOT NULL,
	"status" text NOT NULL,
	"form_date" date NOT NULL,
	"vendor_id" uuid,
	"payee_name" text NOT NULL,
	"payee_address" text NOT NULL,
	"payee_email" text,
	"payee_contact_person" text,
	"payee_contact_phone" text,
	"payee_gstin" text,
	"payee_udyam_number" text,
	"po_number" text,
	"po_date" date,
	"delivery_challan_no" text,
	"delivery_challan_date" date,
	"bill_no" text NOT NULL,
	"bill_date" date NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"bill_passed_for" numeric(14, 2),
	"nature_of_expenditure" text NOT NULL,
	"enclosures" text,
	"special_remarks" text,
	"payment_mode" text NOT NULL,
	"bank_account_no" text,
	"bank_ifsc" text,
	"beneficiary_name" text,
	"submitted_by_name" text NOT NULL,
	"submitted_by_email" text NOT NULL,
	"submitted_by_department" text NOT NULL,
	"recommending_authority_id" uuid NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by_name" text,
	"sent_back_at" timestamp with time zone,
	"admin_remarks" text,
	"edit_token" text,
	"edit_token_expires_at" timestamp with time zone,
	"revision_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"taxable_value" numeric(14, 2),
	"cgst_amount" numeric(14, 2),
	"sgst_amount" numeric(14, 2),
	"igst_amount" numeric(14, 2),
	"igst_rcm_amount" numeric(14, 2),
	"is_gst_bill" boolean,
	"tds_section" text,
	"tds_rate" numeric(5, 2),
	"tds_amount" numeric(14, 2),
	"tally_voucher_type" text,
	"tally_ledger_name" text,
	"tally_exported_at" timestamp with time zone,
	CONSTRAINT "payment_advices_serial_no_unique" UNIQUE("serial_no"),
	CONSTRAINT "payment_advices_edit_token_unique" UNIQUE("edit_token")
);
--> statement-breakpoint
CREATE TABLE "recommending_authorities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"department" text NOT NULL,
	"head_name" text NOT NULL,
	"email" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "serial_counters" (
	"financial_year" text PRIMARY KEY NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_name" text NOT NULL,
	"contact_person" text,
	"contact_phone" text,
	"address" text,
	"email" text,
	"gstin" text,
	"udyam_number" text,
	"is_msme" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_payment_advice_id_payment_advices_id_fk" FOREIGN KEY ("payment_advice_id") REFERENCES "public"."payment_advices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_payment_advice_id_payment_advices_id_fk" FOREIGN KEY ("payment_advice_id") REFERENCES "public"."payment_advices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_advices" ADD CONSTRAINT "payment_advices_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_advices" ADD CONSTRAINT "payment_advices_recommending_authority_id_recommending_authorities_id_fk" FOREIGN KEY ("recommending_authority_id") REFERENCES "public"."recommending_authorities"("id") ON DELETE no action ON UPDATE no action;