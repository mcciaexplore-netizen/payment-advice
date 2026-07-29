CREATE TABLE "cash_voucher_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_advice_id" uuid NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_advices" ALTER COLUMN "sanctioned_by_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_voucher_items" ADD CONSTRAINT "cash_voucher_items_payment_advice_id_payment_advices_id_fk" FOREIGN KEY ("payment_advice_id") REFERENCES "public"."payment_advices"("id") ON DELETE cascade ON UPDATE no action;