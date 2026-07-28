import { SignJWT, jwtVerify } from "jose";

/**
 * All admin authentication lives here so Phase 1's single shared password
 * can later be swapped for Google Workspace SSO without touching page or
 * route code — callers only ever see createAdminSessionToken /
 * verifyAdminSessionToken / verifyAdminPassword.
 *
 * This module is imported by middleware.ts, which runs on the Edge
 * runtime — so it must stay free of Node-only APIs (jose works on both
 * Edge and Node).
 */

export const ADMIN_SESSION_COOKIE = "mccia_admin_session";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(secret);
}

export async function createAdminSessionToken(): Promise<string> {
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifyAdminSessionToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload.role === "admin";
  } catch {
    return false;
  }
}

/** Constant-time string compare, implemented without runtime-specific crypto
 * APIs so this file stays usable from both the Edge and Node runtimes. */
function timingSafeEqual(a: string, b: string): boolean {
  const maxLength = Math.max(a.length, b.length);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < maxLength; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export function verifyAdminPassword(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    throw new Error("ADMIN_PASSWORD environment variable is not set");
  }
  return timingSafeEqual(password, expected);
}
