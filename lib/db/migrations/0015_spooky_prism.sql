CREATE TABLE "admin_user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"recommending_authority_id" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "admin_user_roles_admin_user_id_role_unique" UNIQUE("admin_user_id","role")
);
--> statement-breakpoint
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_recommending_authority_id_recommending_authorities_id_fk" FOREIGN KEY ("recommending_authority_id") REFERENCES "public"."recommending_authorities"("id") ON DELETE no action ON UPDATE no action;