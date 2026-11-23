import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminUsers } from "@/lib/db/schema";
import { getRolesForAdminUser } from "@/lib/admin-users";
import type { AdminSessionPayload } from "@/lib/auth";

type Grant = Awaited<ReturnType<typeof getRolesForAdminUser>>[number];

/** A session for an account and its role rows: every role, the authority
 * link and the Cash Receipt branch (same shape as the Team login). */
export function sessionPayloadFor(user: { id: string; fullName: string }, grants: Grant[], appHub = false): AdminSessionPayload {
  const authorityGrant = grants.find((grant) => grant.role === "AUTHORITY");
  const cashReceiptGrant = grants.find((grant) => grant.role === "CASH_RECEIPT" && grant.scopeValue);
  return {
    adminUserId: user.id,
    fullName: user.fullName,
    roles: grants.map((grant) => grant.role),
    recommendingAuthorityId: authorityGrant?.recommendingAuthorityId ?? null,
    ...(cashReceiptGrant ? { branchScope: cashReceiptGrant.scopeValue! } : {}),
    ...(appHub ? { appHub: true as const } : {}),
  };
}

/** An App Hub sign-in lives for up to 400 days, so its token alone is not
 * trusted for who-can-do-what: on every use the account is looked up again.
 * Switched off, deleted or left with no role: signed out (null). Otherwise
 * the session is rebuilt from the account's current roles, so a role change
 * applies at once. Any other session is returned unchanged, with no query. */
export async function refreshAppHubSession(session: AdminSessionPayload | null): Promise<AdminSessionPayload | null> {
  if (!session?.appHub) return session;
  const [user] = await db
    .select({ id: adminUsers.id, fullName: adminUsers.fullName, isActive: adminUsers.isActive })
    .from(adminUsers)
    .where(eq(adminUsers.id, session.adminUserId))
    .limit(1);
  if (!user?.isActive) return null;
  const grants = await getRolesForAdminUser(user.id);
  if (grants.length === 0) return null;
  return sessionPayloadFor(user, grants, true);
}
