ALTER TABLE "payment_advices" ADD COLUMN "authority_approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_advices" ADD COLUMN "authority_rejected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_advices" ADD COLUMN "authority_remarks" text;--> statement-breakpoint
ALTER TABLE "payment_advices" ADD COLUMN "authority_token" text;--> statement-breakpoint
ALTER TABLE "payment_advices" ADD COLUMN "authority_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_advices" ADD CONSTRAINT "payment_advices_authority_token_unique" UNIQUE("authority_token");