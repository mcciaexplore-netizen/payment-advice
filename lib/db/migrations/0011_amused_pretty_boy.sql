CREATE TABLE "advance_particulars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_advice_id" uuid NOT NULL,
	"category" text NOT NULL,
	"other_description" text,
	"amount" numeric(14, 2) NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "payment_advices" ADD COLUMN "is_advance" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_advices" ADD COLUMN "advance_no" text;--> statement-breakpoint
ALTER TABLE "payment_advices" ADD COLUMN "purpose_of_advance" text;--> statement-breakpoint
ALTER TABLE "payment_advices" ADD COLUMN "previous_pending_advance_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "payment_advices" ADD COLUMN "previous_pending_advance_since" date;--> statement-breakpoint
ALTER TABLE "advance_particulars" ADD CONSTRAINT "advance_particulars_payment_advice_id_payment_advices_id_fk" FOREIGN KEY ("payment_advice_id") REFERENCES "public"."payment_advices"("id") ON DELETE cascade ON UPDATE no action;