ALTER TABLE "payment_advices" ADD COLUMN "verified_by_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_advices" ADD COLUMN "sanctioned_by_name" text NOT NULL;