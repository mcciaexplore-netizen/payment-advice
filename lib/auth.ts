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

/**
 * Multi-role session (see admin_user_roles / AGENT_HANDOFF.md) — a session
 * carries every role the account holds, not just one. `recommendingAuthorityId`
 * is a convenience mirror of the AUTHORITY role's linked authority: present
 * (and required) when `roles` includes "AUTHORITY", null otherwise. Sourced
 * at login time from the matching admin_user_roles row, never from
 * admin_users' now-deprecated columns.
 */
export type AdminSessionPayload = {
  adminUserId: string;
  fullName: string;
  roles: AdminRole[];
  recommendingAuthorityId: string | null;
};

/** True if the session holds the given role — the replacement for every
 * old `session.adminRole === X` equality check across the codebase. */
export function hasRole(
  session: Pick<AdminSessionPayload, "roles"> | null | undefined,
  role: AdminRole,
): boolean {
  return session?.roles.includes(role) ?? false;
}

/** True if the session holds any role other than AUTHORITY — i.e. it's
 * eligible for the Finance Admin area (PAYMENT_ADVICE / CASH_VOUCHER / ALL).
 * AUTHORITY-only sessions are not. */
export function hasFinanceRole(
  session: Pick<AdminSessionPayload, "roles"> | null | undefined,
): boolean {
  return session?.roles.some((r) => r !== "AUTHORITY") ?? false;
}

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
 * strictly — a token signed under an older format (single `adminRole`, or
 * the original shared-password `{role: "admin"}`) fails this and is
 * treated as no session, forcing a fresh per-person login rather than
 * silently accepting a stale-format token. */
export async function decodeAdminSessionToken(
  token: string,
): Promise<AdminSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    const { adminUserId, fullName, roles } = payload;
    if (
      typeof adminUserId !== "string" ||
      typeof fullName !== "string" ||
      !Array.isArray(roles) ||
      roles.length === 0 ||
      !roles.every((r): r is AdminRole => typeof r === "string" && (ADMIN_ROLES as readonly string[]).includes(r)) ||
      !(typeof payload.recommendingAuthorityId === "string" ||
        payload.recommendingAuthorityId === null) ||
      (roles.includes("AUTHORITY") && typeof payload.recommendingAuthorityId !== "string") ||
      (!roles.includes("AUTHORITY") && payload.recommendingAuthorityId !== null)
    ) {
      return null;
    }
    return {
      adminUserId,
      fullName,
      roles: roles as AdminRole[],
      recommendingAuthorityId: payload.recommendingAuthorityId,
    };
  } catch {
    return null;
  }
}

export async function verifyAdminSessionToken(token: string): Promise<boolean> {
  return (await decodeAdminSessionToken(token)) !== null;
}
