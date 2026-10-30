ALTER TABLE "cash_receipts" ADD COLUMN "received_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cash_receipts" ADD COLUMN "received_by" text;--> statement-breakpoint
ALTER TABLE "cash_receipts" ADD COLUMN "received_note" text;--> statement-breakpoint
ALTER TABLE "cash_receipts" ADD COLUMN "received_email_sent_at" timestamp with time zone;