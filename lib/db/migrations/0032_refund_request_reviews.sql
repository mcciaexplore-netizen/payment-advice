CREATE TABLE "refund_request_reviews" (
	"refund_request_id" uuid PRIMARY KEY NOT NULL,
	"decision" text NOT NULL,
	"decided_by_name" text NOT NULL,
	"decided_by_authority_id" uuid,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"remarks" text,
	CONSTRAINT "refund_request_reviews_decision_check" CHECK ("refund_request_reviews"."decision" in ('RECOMMENDED', 'SENT_BACK')),
	CONSTRAINT "refund_request_reviews_sent_back_remarks_check" CHECK ("refund_request_reviews"."decision" <> 'SENT_BACK' or ("refund_request_reviews"."remarks" is not null and length(btrim("refund_request_reviews"."remarks")) > 0))
);
--> statement-breakpoint
ALTER TABLE "refund_request_reviews" ADD CONSTRAINT "refund_request_reviews_refund_request_id_refund_requests_id_fk" FOREIGN KEY ("refund_request_id") REFERENCES "public"."refund_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_request_reviews" ADD CONSTRAINT "refund_request_reviews_decided_by_authority_id_recommending_authorities_id_fk" FOREIGN KEY ("decided_by_authority_id") REFERENCES "public"."recommending_authorities"("id") ON DELETE no action ON UPDATE no action;