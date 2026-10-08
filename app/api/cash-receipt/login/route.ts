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
import { BRANCH_OPTIONS } from "@/lib/validation/payment-advice";
import { findLocalCashReceiptUser } from "@/lib/cash-receipt-local-users";

export const runtime = "nodejs";

const DUMMY_HASH = "$2a$12$CwTycUXWue0Thq9StjUM0uJ8n7Kn8b0Q3E1Y3jz3aOVfV1c5b1u0G";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (typeof body?.email !== "string" || typeof body?.password !== "string") {
    return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
  }

  if (process.env.NODE_ENV !== "production") {
    const localUser = await findLocalCashReceiptUser(body.email);
    if (!localUser) {
      try {
        const user = await findActiveAdminUserByEmail(body.email);
        const passwordOk = await verifyPassword(body.password, user?.passwordHash ?? DUMMY_HASH);
        if (!user || !passwordOk) {
          return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
        }
        const roleGrants = await getRolesForAdminUser(user.id);
        const branchGrant = roleGrants.find((grant) => grant.role === "CASH_RECEIPT" && grant.scopeValue);
        if (!branchGrant || !BRANCH_OPTIONS.includes(branchGrant.scopeValue as typeof BRANCH_OPTIONS[number])) {
          return NextResponse.json({ error: "This account has not been given Cash Receipt access. Contact Finance if you believe this is wrong." }, { status: 403 });
        }
        const authorityGrant = roleGrants.find((grant) => grant.role === "AUTHORITY");
        const token = await createAdminSessionToken({
          adminUserId: user.id,
          fullName: user.fullName,
          roles: roleGrants.map((grant) => grant.role),
          recommendingAuthorityId: authorityGrant?.recommendingAuthorityId ?? null,
          branchScope: branchGrant.scopeValue!,
        });
        const response = NextResponse.json({ ok: true });
        response.cookies.set(ADMIN_SESSION_COOKIE, token, {
          httpOnly: true,
          secure: false,
          sameSite: "lax",
          maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
          path: "/",
        });
        return response;
      } catch (error) {
        console.error("Local Cash Receipt account lookup failed", error);
        return NextResponse.json({ error: "Existing account sign-in needs the app database connection, which is not configured in this local checkout." }, { status: 503 });
      }
    }
    let fullName = localUser.fullName;
    if (!process.env.DATABASE_URL) {
      const localPasswordOk = localUser.passwordHash
        ? await verifyPassword(body.password, localUser.passwordHash)
        : false;
      if (!localPasswordOk) {
        return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
      }
    } else {
      try {
        const account = await findActiveAdminUserByEmail(body.email);
        const passwordOk = await verifyPassword(body.password, account?.passwordHash ?? DUMMY_HASH);
        if (!account || !passwordOk) {
          return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
        }
        fullName = account.fullName;
      } catch (error) {
        console.error("Local Cash Receipt account lookup failed", error);
        const localPasswordOk = localUser.passwordHash
          ? await verifyPassword(body.password, localUser.passwordHash)
          : false;
        if (!localPasswordOk) {
          return NextResponse.json({ error: "Could not verify this existing account. Check the local app's database connection and try again." }, { status: 503 });
        }
      }
    }
    if (!BRANCH_OPTIONS.includes(localUser.branch as typeof BRANCH_OPTIONS[number])) {
      return NextResponse.json({ error: "This local account has an invalid branch assignment." }, { status: 403 });
    }
    const token = await createAdminSessionToken({
      adminUserId: `local:${localUser.email}`,
      fullName,
      roles: ["BRANCH"],
      recommendingAuthorityId: null,
      branchScope: localUser.branch,
    });
    const response = NextResponse.json({ ok: true });
    response.cookies.set(ADMIN_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
      path: "/",
    });
    return response;
  }

  try {
    const user = await findActiveAdminUserByEmail(body.email);
    const passwordOk = await verifyPassword(body.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !passwordOk) {
      return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
    }

    const roleGrants = await getRolesForAdminUser(user.id);
    const branchGrant = roleGrants.find((grant) => grant.role === "CASH_RECEIPT" && grant.scopeValue);
    if (!branchGrant || !BRANCH_OPTIONS.includes(branchGrant.scopeValue as typeof BRANCH_OPTIONS[number])) {
      return NextResponse.json({ error: "This account has not been given Cash Receipt access. Contact Finance if you believe this is wrong." }, { status: 403 });
    }

    await recordAdminLogin(user.id);
    const authorityGrant = roleGrants.find((grant) => grant.role === "AUTHORITY");
    const token = await createAdminSessionToken({
      adminUserId: user.id,
      fullName: user.fullName,
      roles: roleGrants.map((grant) => grant.role),
      recommendingAuthorityId: authorityGrant?.recommendingAuthorityId ?? null,
      branchScope: branchGrant.scopeValue!,
    });
    const response = NextResponse.json({ ok: true });
    response.cookies.set(ADMIN_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
      path: "/",
    });
    return response;
  } catch (error) {
    console.error("Cash Receipt login failed", error);
    return NextResponse.json({ error: "Cash Receipt login is unavailable. Please try again later." }, { status: 503 });
  }
}
