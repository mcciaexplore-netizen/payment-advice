import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  createAdminSessionToken,
} from "@/lib/auth";
import {
  findActiveAdminUserByEmail,
  getRolesForAdminUser,
  recordAdminLogin,
  verifyPassword,
} from "@/lib/admin-users";

export const runtime = "nodejs";

const DUMMY_HASH = "$2a$12$CwTycUXWue0Thq9StjUM0uJ8n7Kn8b0Q3E1Y3jz3aOVfV1c5b1u0G";

export async function POST(req: NextRequest) {
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
  const authorityGrant = roleGrants.find((r) => r.role === "AUTHORITY");
  if (!authorityGrant || !authorityGrant.recommendingAuthorityId) {
    return NextResponse.json(
      { error: "This account does not have access to Authority Recommendations." },
      { status: 403 },
    );
  }

  await recordAdminLogin(user.id);
  const token = await createAdminSessionToken({
    adminUserId: user.id,
    fullName: user.fullName,
    roles: roleGrants.map((r) => r.role),
    recommendingAuthorityId: authorityGrant.recommendingAuthorityId,
  });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
  return response;
}
