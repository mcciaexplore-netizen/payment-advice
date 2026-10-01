ALTER TABLE "vendor_requests" ADD COLUMN "requested_vendor_email" text NOT NULL;--> statement-breakpoint
ALTER TABLE "vendor_requests" ADD COLUMN "msme_email_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vendor_requests" ADD COLUMN "msme_email_message_id" text;