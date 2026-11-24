import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { recommendingAuthorities } from "@/lib/db/schema";
import { getAdminSession } from "@/lib/admin-session";
import { hasRole } from "@/lib/auth";

/** The signed-in recommending authority, from their own session: the id on
 * their account and the name on that authority record. Null for anyone who
 * is not an authority account. Refund routes and pages scope everything by
 * this, never by a value from the URL or the request. */
export async function getRefundAuthority(): Promise<{ id: string; name: string } | null> {
  const session = await getAdminSession();
  if (!session || !hasRole(session, "AUTHORITY") || !session.recommendingAuthorityId) return null;
  const [authority] = await db
    .select({ authorityName: recommendingAuthorities.authorityName })
    .from(recommendingAuthorities)
    .where(eq(recommendingAuthorities.id, session.recommendingAuthorityId))
    .limit(1);
  return authority ? { id: session.recommendingAuthorityId, name: authority.authorityName } : null;
}
