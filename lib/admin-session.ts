import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, AdminSessionPayload, decodeAdminSessionToken } from "@/lib/auth";

/** Reads and decodes the current request's Admin session from cookies —
 * for use in Server Components and Route Handlers only (uses next/headers,
 * so it's Node-only; proxy.ts already guarantees a valid session cookie
 * exists for every /admin* and /api/admin* request by the time this runs,
 * but callers should still treat a null return as "not logged in"). */
export async function getAdminSession(): Promise<AdminSessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;
  return decodeAdminSessionToken(token);
}
