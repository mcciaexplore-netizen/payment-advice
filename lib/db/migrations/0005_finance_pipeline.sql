ALTER TABLE "payment_advices" ADD COLUMN "finance_received_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_advices" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_advices" ADD COLUMN "verified_by" text;--> statement-breakpoint
ALTER TABLE "payment_advices" ADD COLUMN "sanctioned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_advices" ADD COLUMN "sanctioned_by" text;--> statement-breakpoint
-- sanctioned_by_name was the submitter's free-text note at submission time
-- ("who I expect will sanction this") — superseded by the admin-recorded
-- sanctioned_by above (one of 2 fixed names, set only when Finance actually
-- sanctions it). Confirmed with the human before dropping: as of this
-- migration only one row has a non-null value here (a pre-existing test
-- submission, not real business data), and nothing else in the codebase
-- reads this column (Excel export never included it; the Cash Voucher PDF
-- and Payment Advice PDF are being repointed at sanctioned_by in this same
-- session). See AGENT_HANDOFF.md for the full reasoning.
ALTER TABLE "payment_advices" DROP COLUMN "sanctioned_by_name";
