CREATE TABLE "staff_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "staff_authority_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_member_id" uuid NOT NULL,
	"recommending_authority_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_authority_options_staff_member_id_recommending_authority_id_unique" UNIQUE("staff_member_id","recommending_authority_id")
);
--> statement-breakpoint
ALTER TABLE "staff_authority_options" ADD CONSTRAINT "staff_authority_options_staff_member_id_staff_members_id_fk" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "staff_authority_options" ADD CONSTRAINT "staff_authority_options_recommending_authority_id_recommending_authorities_id_fk" FOREIGN KEY ("recommending_authority_id") REFERENCES "public"."recommending_authorities"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- The 3 existing rows are the Phase 1 department-based test authorities;
-- confirmed zero payment_advices reference them (see AGENT_HANDOFF.md /
-- session notes) before this migration was written. authority_name is
-- NOT NULL with no default, so this table must be empty before the ADD
-- COLUMN below — the real roster is repopulated by
-- scripts/import-master-data.ts immediately after this migration runs.
DELETE FROM "recommending_authorities";
--> statement-breakpoint
ALTER TABLE "recommending_authorities" ADD COLUMN "authority_name" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "recommending_authorities" DROP COLUMN "department";
--> statement-breakpoint
ALTER TABLE "recommending_authorities" DROP COLUMN "head_name";
