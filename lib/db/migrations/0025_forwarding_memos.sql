CREATE TABLE "forwarding_memos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"memo_date" date NOT NULL,
	"party_name" text NOT NULL,
	"party_address" text NOT NULL,
	"purpose" text NOT NULL,
	"bill_no" text,
	"bill_date" date,
	"instrument_mode" text NOT NULL,
	"instrument_no" text NOT NULL,
	"instrument_date" date NOT NULL,
	"drawn_on_bank" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"submitted_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forwarding_memos_instrument_mode_check" CHECK ("forwarding_memos"."instrument_mode" in ('CHEQUE', 'DD')),
	CONSTRAINT "forwarding_memos_amount_positive_check" CHECK ("forwarding_memos"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "forwarding_memo_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_forwarding_memo_id_forwarding_memos_id_fk" FOREIGN KEY ("forwarding_memo_id") REFERENCES "public"."forwarding_memos"("id") ON DELETE no action ON UPDATE no action;