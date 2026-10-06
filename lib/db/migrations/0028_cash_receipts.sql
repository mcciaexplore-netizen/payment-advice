CREATE TABLE "cash_receipt_counters" (
	"branch" text NOT NULL,
	"financial_year" text NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "cash_receipt_counters_branch_financial_year_pk" PRIMARY KEY("branch","financial_year")
);
--> statement-breakpoint
CREATE TABLE "cash_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch" text NOT NULL,
	"financial_year" text NOT NULL,
	"receipt_number" integer NOT NULL,
	"receipt_date" date NOT NULL,
	"party_name" text NOT NULL,
	"gstin" text,
	"items" jsonb NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"issued_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_receipts_branch_financial_year_receipt_number_unique" UNIQUE("branch","financial_year","receipt_number")
);
