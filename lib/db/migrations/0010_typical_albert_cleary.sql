CREATE TABLE "payment_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_advice_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"remarks" text NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "payment_advices" ADD COLUMN "basic_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "payment_advices" ADD COLUMN "gst_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "payment_advices" ADD COLUMN "total_paid" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_entries" ADD CONSTRAINT "payment_entries_payment_advice_id_payment_advices_id_fk" FOREIGN KEY ("payment_advice_id") REFERENCES "public"."payment_advices"("id") ON DELETE cascade ON UPDATE no action;