/**
 * Row-by-row verification that the admin_user_roles backfill is lossless:
 * every admin_users row must have exactly one matching admin_user_roles row
 * with the same role and recommending_authority_id. Also checks the reverse
 * direction (no orphan/extra role rows for pre-migration accounts) and
 * flags any account with more than 1 role (expected to be empty before
 * Chintamani's second role is added).
 *
 * Usage: npx tsx scripts/verify-admin-user-roles-backfill.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../lib/db";
import { adminUsers, adminUserRoles } from "../lib/db/schema";

async function main() {
  const users = await db.select().from(adminUsers);
  const roles = await db.select().from(adminUserRoles);

  let mismatches = 0;

  for (const user of users) {
    const matches = roles.filter((r) => r.adminUserId === user.id);
    if (matches.length === 0) {
      console.error(`MISSING: ${user.email} (${user.role}) has no admin_user_roles row at all.`);
      mismatches += 1;
      continue;
    }
    const exact = matches.find(
      (r) => r.role === user.role && r.recommendingAuthorityId === user.recommendingAuthorityId,
    );
    if (!exact) {
      console.error(
        `MISMATCH: ${user.email} — admin_users has role=${user.role}/authorityId=${user.recommendingAuthorityId}, ` +
          `but admin_user_roles rows are ${JSON.stringify(matches)}`,
      );
      mismatches += 1;
    }
  }

  const userIds = new Set(users.map((u) => u.id));
  const orphans = roles.filter((r) => !userIds.has(r.adminUserId));
  if (orphans.length > 0) {
    console.error(`ORPHAN role rows with no matching admin_users row: ${JSON.stringify(orphans)}`);
    mismatches += orphans.length;
  }

  console.log(`\n${users.length} admin_users rows, ${roles.length} admin_user_roles rows.`);
  console.log(`Mismatches: ${mismatches}`);

  const multiRole = users
    .map((u) => ({ email: u.email, count: roles.filter((r) => r.adminUserId === u.id).length }))
    .filter((u) => u.count > 1);
  console.log(`Accounts with >1 role: ${JSON.stringify(multiRole)}`);

  if (mismatches > 0) process.exitCode = 1;
}

main().finally(() => process.exit(process.exitCode ?? 0));
