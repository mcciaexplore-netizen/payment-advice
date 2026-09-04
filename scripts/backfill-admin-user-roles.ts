/**
 * Backfills admin_user_roles from admin_users' existing (deprecated) role /
 * recommending_authority_id columns — one role row per existing admin_users
 * row, lossless. Idempotent: skips a user who already has a matching role
 * row (safe to re-run). Does NOT touch admin_users itself.
 *
 * Usage: npx tsx scripts/backfill-admin-user-roles.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { eq, and } from "drizzle-orm";
import { db } from "../lib/db";
import { adminUsers, adminUserRoles } from "../lib/db/schema";

async function main() {
  const users = await db.select().from(adminUsers);
  let created = 0;
  let skipped = 0;

  for (const user of users) {
    const [existing] = await db
      .select()
      .from(adminUserRoles)
      .where(and(eq(adminUserRoles.adminUserId, user.id), eq(adminUserRoles.role, user.role)))
      .limit(1);

    if (existing) {
      if (existing.recommendingAuthorityId !== user.recommendingAuthorityId) {
        throw new Error(
          `Mismatch for ${user.email}: existing admin_user_roles row has ` +
            `recommendingAuthorityId=${existing.recommendingAuthorityId}, but admin_users has ` +
            `${user.recommendingAuthorityId}. Refusing to silently overwrite — investigate first.`,
        );
      }
      skipped += 1;
      continue;
    }

    await db.insert(adminUserRoles).values({
      adminUserId: user.id,
      role: user.role,
      recommendingAuthorityId: user.recommendingAuthorityId,
    });
    created += 1;
  }

  console.log(`Backfill complete: ${created} role row(s) created, ${skipped} already present (idempotent re-run).`);
}

main().finally(() => process.exit(0));
