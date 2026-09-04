/**
 * One-off: grants Chintamani Shrotri's existing admin_users account a second
 * role (ALL / Full Admin), alongside his existing AUTHORITY role. Does NOT
 * create a new admin_users row — same admin_user_id, one additional
 * admin_user_roles row.
 *
 * Usage: npx tsx scripts/add-chintamani-all-role.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { adminUsers, adminUserRoles } from "../lib/db/schema";

const EMAIL = "chintamanis@mcciapune.com";

async function main() {
  const [user] = await db.select().from(adminUsers).where(eq(adminUsers.email, EMAIL)).limit(1);
  if (!user) throw new Error(`No admin_users row for ${EMAIL} — refusing to create a new account.`);

  const existingRoles = await db.select().from(adminUserRoles).where(eq(adminUserRoles.adminUserId, user.id));
  console.log(`Before: ${user.fullName} (${user.email}) has roles: ${JSON.stringify(existingRoles.map((r) => r.role))}`);

  if (existingRoles.some((r) => r.role === "ALL")) {
    console.log("Already has an ALL role row — nothing to do (idempotent).");
    return;
  }

  await db.insert(adminUserRoles).values({ adminUserId: user.id, role: "ALL", recommendingAuthorityId: null });

  const after = await db.select().from(adminUserRoles).where(eq(adminUserRoles.adminUserId, user.id));
  console.log(`After: roles = ${JSON.stringify(after.map((r) => ({ role: r.role, recommendingAuthorityId: r.recommendingAuthorityId })))}`);
}

main().finally(() => process.exit(0));
