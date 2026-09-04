import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminUsers, adminUserRoles } from "@/lib/db/schema";
import type { AdminRole } from "@/lib/auth";

// Pure-JS (no native bindings) so it bundles reliably for Vercel's
// serverless Node runtime with no platform-specific compile step — unlike
// the native `bcrypt` package.
const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function findActiveAdminUserByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  const [user] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.email, normalized))
    .limit(1);
  if (!user || !user.isActive) return null;
  return user;
}

export async function recordAdminLogin(adminUserId: string): Promise<void> {
  await db
    .update(adminUsers)
    .set({ lastLoginAt: new Date() })
    .where(eq(adminUsers.id, adminUserId));
}

/** The single source of truth for what roles a signed-in account holds —
 * reads admin_user_roles, never admin_users' deprecated role/
 * recommending_authority_id columns. Every login route calls this to build
 * the session's `roles` list. */
export async function getRolesForAdminUser(
  adminUserId: string,
): Promise<{ role: AdminRole; recommendingAuthorityId: string | null }[]> {
  const rows = await db
    .select({ role: adminUserRoles.role, recommendingAuthorityId: adminUserRoles.recommendingAuthorityId })
    .from(adminUserRoles)
    .where(eq(adminUserRoles.adminUserId, adminUserId));
  return rows.map((r) => ({ role: r.role as AdminRole, recommendingAuthorityId: r.recommendingAuthorityId }));
}
