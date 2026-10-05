CREATE TABLE "vendor_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requested_name" text NOT NULL,
	"requested_address" text NOT NULL,
	"requested_gstin" text,
	"msme_status" text,
	"msme_document_url" text,
	"msme_document_type" text,
	"requested_by_name" text NOT NULL,
	"requested_by_email" text NOT NULL,
	"payment_advice_id" uuid NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by" text,
	"approved_vendor_id" uuid,
	"sent_back_at" timestamp with time zone,
	"sent_back_by" text,
	"sent_back_remarks" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "vendor_request_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_advices" ADD COLUMN "pending_vendor_request_id" uuid;--> statement-breakpoint
ALTER TABLE "vendor_requests" ADD CONSTRAINT "vendor_requests_payment_advice_id_payment_advices_id_fk" FOREIGN KEY ("payment_advice_id") REFERENCES "public"."payment_advices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_requests" ADD CONSTRAINT "vendor_requests_approved_vendor_id_vendors_id_fk" FOREIGN KEY ("approved_vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_vendor_request_id_vendor_requests_id_fk" FOREIGN KEY ("vendor_request_id") REFERENCES "public"."vendor_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_advices" ADD CONSTRAINT "payment_advices_pending_vendor_request_id_vendor_requests_id_fk" FOREIGN KEY ("pending_vendor_request_id") REFERENCES "public"."vendor_requests"("id") ON DELETE no action ON UPDATE no action;