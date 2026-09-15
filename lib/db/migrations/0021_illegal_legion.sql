CREATE TABLE "vendor_bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"bank_account_no" text NOT NULL,
	"bank_ifsc" text NOT NULL,
	"beneficiary_name" text NOT NULL,
	"source_advice_id" uuid,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_bank_accounts_vendor_id_bank_account_no_bank_ifsc_unique" UNIQUE("vendor_id","bank_account_no","bank_ifsc")
);
--> statement-breakpoint
ALTER TABLE "vendor_bank_accounts" ADD CONSTRAINT "vendor_bank_accounts_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_bank_accounts" ADD CONSTRAINT "vendor_bank_accounts_source_advice_id_payment_advices_id_fk" FOREIGN KEY ("source_advice_id") REFERENCES "public"."payment_advices"("id") ON DELETE no action ON UPDATE no action;