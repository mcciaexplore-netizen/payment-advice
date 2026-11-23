import type { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, APP_HUB_SESSION_MAX_AGE_SECONDS } from "@/lib/auth";

export { appHubOrigins, frameAncestorsPolicy } from "@/lib/app-hub-config";

/** Sets the session cookie. Inside the App Hub the Payment Desk is a
 * third-party page, so the cookie must be SameSite=None and Secure to be
 * sent at all, and Partitioned so it lives only under the App Hub (a visit
 * to the Payment Desk on its own never sees or sends it). It is kept as long
 * as a browser allows (400 days) so later App Hub visits need no second
 * sign-in; lib/app-hub-session.ts re-checks the account on every use. Outside
 * the App Hub: a browser-session cookie, exactly as before. */
export function setSessionCookie(response: NextResponse, token: string, embedded: boolean) {
  if (embedded) {
    response.cookies.set(ADMIN_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      partitioned: true,
      maxAge: APP_HUB_SESSION_MAX_AGE_SECONDS,
      path: "/",
    });
    return;
  }
  response.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

/** Signs out of both kinds of session (a browser keeps them apart). */
export function clearSessionCookies(response: NextResponse) {
  response.cookies.delete(ADMIN_SESSION_COOKIE);
  response.headers.append(
    "Set-Cookie",
    `${ADMIN_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None; Partitioned`,
  );
}
