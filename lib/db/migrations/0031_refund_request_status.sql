ALTER TABLE "refund_requests" ADD COLUMN "status" text DEFAULT 'SUBMITTED' NOT NULL;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD COLUMN "status_remarks" text;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD COLUMN "status_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_status_check" CHECK ("refund_requests"."status" in ('SUBMITTED', 'SENT_BACK', 'CANCELLED'));