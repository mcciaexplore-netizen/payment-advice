CREATE TABLE "cash_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"serial_no" text NOT NULL,
	"financial_year" text NOT NULL,
	"branch" text NOT NULL,
	"receipt_date" date NOT NULL,
	"party_name" text NOT NULL,
	"gstin" text,
	"items" jsonb NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"issued_by_user_id" uuid NOT NULL,
	"submitted_by_name" text NOT NULL,
	"submitted_by_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_receipts_serial_no_unique" UNIQUE("serial_no"),
	CONSTRAINT "cash_receipts_branch_check" CHECK ("cash_receipts"."branch" in ('SB Road Office', 'Tilak Road Office', 'Hadapsar Office', 'Bhosari Office', 'Ahilyanagar Office')),
	CONSTRAINT "cash_receipts_total_positive_check" CHECK ("cash_receipts"."total" > 0)
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "cash_receipt_id" uuid;--> statement-breakpoint
ALTER TABLE "cash_receipts" ADD CONSTRAINT "cash_receipts_issued_by_user_id_admin_users_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_cash_receipt_id_cash_receipts_id_fk" FOREIGN KEY ("cash_receipt_id") REFERENCES "public"."cash_receipts"("id") ON DELETE no action ON UPDATE no action;