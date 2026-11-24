import { NextRequest, NextResponse } from "next/server";
import { createAdminSessionToken } from "@/lib/auth";
import { appHubOrigins, setSessionCookie } from "@/lib/app-hub";
import { sessionPayloadFor } from "@/lib/app-hub-session";
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
  // Signed in from inside the App Hub (and an App Hub is configured): a
  // long-lived session, remembered there (see lib/app-hub.ts).
  const embedded = body.embedded === true && appHubOrigins().length > 0;
  const token = await createAdminSessionToken(sessionPayloadFor(user, roleGrants, embedded));
  const response = NextResponse.json({ ok: true });
  setSessionCookie(response, token, embedded);
  return response;
}
