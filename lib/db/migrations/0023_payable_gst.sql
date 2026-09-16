ALTER TABLE "payment_advices" ADD COLUMN "gst_settled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_advices" ADD COLUMN "gst_settled_by" text;--> statement-breakpoint
ALTER TABLE "payment_advices" ADD COLUMN "gst_settled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_advices" ADD COLUMN "arrears_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "payment_advices" ADD COLUMN "arrears_tds_percent" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "payment_advices" ADD COLUMN "current_tds_percent" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "payment_advices" ADD COLUMN "payable_amount" numeric(14, 2);--> statement-breakpoint
UPDATE "payment_advices"
SET "payable_amount" = "bill_passed_for"
WHERE "payable_amount" IS NULL
  AND "bill_passed_for" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "payment_entries"
    WHERE "payment_entries"."payment_advice_id" = "payment_advices"."id"
  );
