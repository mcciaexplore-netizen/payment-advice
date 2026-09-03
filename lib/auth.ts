import { SignJWT, jwtVerify } from "jose";

/**
 * Real per-person Admin authentication (admin_users table), replacing the
 * old shared ADMIN_PASSWORD. This module only signs/verifies the session
 * JWT — it stays free of Node-only APIs (bcrypt, DB access) because it's
 * imported by proxy.ts, which runs on the Edge runtime. Password hashing
 * and DB lookups live in lib/admin-users.ts (Node-only); reading the
 * decoded session from a request's cookies in a Server Component/Route
 * Handler lives in lib/admin-session.ts (also Node-only, uses next/headers).
 */

export const ADMIN_SESSION_COOKIE = "mccia_admin_session";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export const ADMIN_ROLES = ["PAYMENT_ADVICE", "CASH_VOUCHER", "ALL", "AUTHORITY"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export type AdminSessionPayload = {
  adminUserId: string;
  fullName: string;
  adminRole: AdminRole;
  recommendingAuthorityId: string | null;
};

function getSecretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(secret);
}

export async function createAdminSessionToken(
  session: AdminSessionPayload,
): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecretKey());
}

/** Verifies the JWT signature/expiry and validates the payload shape
 * strictly (all three claims present as the right type) — a token signed
 * under the old shared-password format (`{role: "admin"}` only) fails this
 * and is treated as no session, forcing a fresh per-person login rather
 * than silently accepting a stale-format token. */
export async function decodeAdminSessionToken(
  token: string,
): Promise<AdminSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    const { adminUserId, fullName, adminRole } = payload;
    if (
      typeof adminUserId !== "string" ||
      typeof fullName !== "string" ||
      typeof adminRole !== "string" ||
      !(ADMIN_ROLES as readonly string[]).includes(adminRole) ||
      !(typeof payload.recommendingAuthorityId === "string" ||
        payload.recommendingAuthorityId === null) ||
      (adminRole === "AUTHORITY" && typeof payload.recommendingAuthorityId !== "string") ||
      (adminRole !== "AUTHORITY" && payload.recommendingAuthorityId !== null)
    ) {
      return null;
    }
    return {
      adminUserId,
      fullName,
      adminRole: adminRole as AdminRole,
      recommendingAuthorityId: payload.recommendingAuthorityId,
    };
  } catch {
    return null;
  }
}

export async function verifyAdminSessionToken(token: string): Promise<boolean> {
  return (await decodeAdminSessionToken(token)) !== null;
}
