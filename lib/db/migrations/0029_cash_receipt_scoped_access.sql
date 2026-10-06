ALTER TABLE "admin_user_roles" DROP CONSTRAINT "admin_user_roles_scope_value_check";--> statement-breakpoint
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_scope_value_check" CHECK (("admin_user_roles"."role" in ('BRANCH', 'DEPARTMENT', 'CASH_RECEIPT') and "admin_user_roles"."scope_value" is not null) or ("admin_user_roles"."role" not in ('BRANCH', 'DEPARTMENT', 'CASH_RECEIPT') and "admin_user_roles"."scope_value" is null));
--> statement-breakpoint
WITH cash_receipt_access(email, branch) AS (
  VALUES
    ('sasidharan@mcciapune.com', 'Tilak Road Office'),
    ('aefc@mcciapune.com', 'Hadapsar Office'),
    ('mccianagar@mcciapune.com', 'Ahilyanagar Office'),
    ('mandarm@mcciapune.com', 'Bhosari Office')
)
INSERT INTO admin_user_roles (admin_user_id, role, scope_value)
SELECT admin_users.id, 'CASH_RECEIPT', cash_receipt_access.branch
FROM admin_users
JOIN cash_receipt_access ON lower(admin_users.email) = cash_receipt_access.email
ON CONFLICT (admin_user_id, role)
DO UPDATE SET scope_value = EXCLUDED.scope_value;
