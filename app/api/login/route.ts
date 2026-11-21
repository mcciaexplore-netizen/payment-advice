import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, createAdminSessionToken } from "@/lib/auth";
import { findActiveAdminUserByEmail, getRolesForAdminUser, recordAdminLogin, verifyPassword } from "@/lib/admin-users";
import { clientIpFrom, createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Same bcrypt cost as a real hash, so an unknown email takes as long as a
// wrong password and timing cannot reveal which emails have accounts.
const DUMMY_HASH = "$2a$12$CwTycUXWue0Thq9StjUM0uJ8n7Kn8b0Q3E1Y3jz3aOVfV1c5b1u0G";
// Counts every attempt, 10 per 15 minutes per IP (best effort, per instance).
const isLimited = createRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 });

/** Payment Desk sign-in: the one door in front of the home page and the
 * submission forms. Any active account with at least one role may sign in.
 * The session carries every role the account holds (plus its authority link
 * and Cash Receipt branch, like the Team login), so the Finance and Team
 * dashboards accept it without a second sign-in. What each dashboard shows
 * is still decided by those roles, unchanged. */
export async function POST(req: NextRequest) {
  if (isLimited(clientIpFrom(req.headers))) {
    return NextResponse.json({ error: "Too many attempts. Please try again in 15 minutes." }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  if (typeof body?.email !== "string" || typeof body?.password !== "string") {
    return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
  }

  const user = await findActiveAdminUserByEmail(body.email);
  const passwordOk = await verifyPassword(body.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !passwordOk) {
    return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
  }

  const roleGrants = await getRolesForAdminUser(user.id);
  if (roleGrants.length === 0) {
    return NextResponse.json({ error: "This account has no access yet. Please contact Finance." }, { status: 403 });
  }

  await recordAdminLogin(user.id);
  const authorityGrant = roleGrants.find((grant) => grant.role === "AUTHORITY");
  const cashReceiptGrant = roleGrants.find((grant) => grant.role === "CASH_RECEIPT" && grant.scopeValue);
  const token = await createAdminSessionToken({
    adminUserId: user.id,
    fullName: user.fullName,
    roles: roleGrants.map((grant) => grant.role),
    recommendingAuthorityId: authorityGrant?.recommendingAuthorityId ?? null,
    ...(cashReceiptGrant ? { branchScope: cashReceiptGrant.scopeValue! } : {}),
  });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  return response;
}
