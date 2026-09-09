ALTER TABLE "payment_advices" ADD COLUMN "rejected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_advices" ADD COLUMN "rejected_by" text;--> statement-breakpoint
ALTER TABLE "payment_advices" ADD COLUMN "rejection_remarks" text;