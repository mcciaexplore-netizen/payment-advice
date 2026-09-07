ALTER TABLE "cash_voucher_items" ADD COLUMN "bill_no" text;--> statement-breakpoint
ALTER TABLE "cash_voucher_items" ADD COLUMN "bill_date" date;--> statement-breakpoint
ALTER TABLE "cash_voucher_items" ADD COLUMN "attachment_id" uuid;--> statement-breakpoint
ALTER TABLE "cash_voucher_items" ADD CONSTRAINT "cash_voucher_items_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE set null ON UPDATE no action;