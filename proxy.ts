import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, decodeAdminSessionToken, hasFinanceRole, hasTeamDashboardRole } from "@/lib/auth";
import { DESK_PATHS, safeNextPath } from "@/lib/desk-login";
import { refreshAppHubSession } from "@/lib/app-hub-session";

const PUBLIC_ADMIN_PATHS = new Set(["/admin/login", "/api/admin/login"]);
const PUBLIC_AUTHORITY_PATHS = new Set(["/authority/login", "/api/authority/login"]);
const PUBLIC_TEAM_PATHS = new Set(["/team/login", "/api/team/login"]);

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  // An App Hub sign-in (up to 400 days) is re-checked against the account
  // on every request: switched off means signed out, role changes apply now.
  const session = token ? await refreshAppHubSession(await decodeAdminSessionToken(token)) : null;
  // Payment Desk sign-in: the home page and the submission forms open only
  // after signing in; the sign-in page itself sends a signed-in user on.
  if (DESK_PATHS.has(pathname)) {
    if (!session) {
      const loginUrl = new URL("/login", req.url);
      if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
      // Opened inside the App Hub: keep that (and the email it passes) for the sign-in page.
      if (req.nextUrl.searchParams.get("embed") === "1") {
        loginUrl.searchParams.set("embed", "1");
        const email = req.nextUrl.searchParams.get("email");
        if (email) loginUrl.searchParams.set("email", email);
      }
      return NextResponse.redirect(loginUrl, 302);
    }
    return NextResponse.next();
  }
  if (pathname === "/login") {
    if (session) return NextResponse.redirect(new URL(safeNextPath(req.nextUrl.searchParams.get("next")), req.url), 302);
    return NextResponse.next();
  }

  const isAuthorityPath = pathname === "/authority" || pathname.startsWith("/authority/") || pathname.startsWith("/api/authority/");

  // Shared account-management routes (e.g. Change Password) — any signed-in
  // admin_users session may use these regardless of role, unlike
  // /api/admin/* (Finance-only) and /api/authority/* (Authority-only) below.
  if (pathname.startsWith("/api/account/")) {
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (PUBLIC_AUTHORITY_PATHS.has(pathname)) {
    if (pathname === "/authority/login" && session?.roles.includes("AUTHORITY")) {
      return NextResponse.redirect(new URL("/authority", req.url), 302);
    }
    return NextResponse.next();
  }

  if (PUBLIC_TEAM_PATHS.has(pathname)) {
    // Any team role already signed in (including SELF and CASH_RECEIPT, e.g.
    // from the Payment Desk sign-in) goes straight to its dashboard.
    const teamRole = session?.roles.find((role) => role === "BRANCH" || role === "DEPARTMENT" || role === "SELF" || role === "CASH_RECEIPT");
    if (pathname === "/team/login" && teamRole) {
      return NextResponse.redirect(new URL(`/authority?role=${teamRole}`, req.url), 302);
    }
    return NextResponse.next();
  }

  if (isAuthorityPath) {
    if (!hasTeamDashboardRole(session)) {
      if (pathname.startsWith("/api/authority/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/authority/login", req.url), 302);
    }
    return NextResponse.next();
  }

  if (PUBLIC_ADMIN_PATHS.has(pathname)) {
    if (pathname === "/admin/login" && hasFinanceRole(session)) {
      return NextResponse.redirect(new URL("/admin", req.url), 302);
    }
    return NextResponse.next();
  }

  if (!hasFinanceRole(session)) {
    if (pathname.startsWith("/api/admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/admin/login", req.url);
    return NextResponse.redirect(loginUrl, 302);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/payment-advice",
    "/cash-voucher",
    "/advance",
    "/refund",
    "/forwarding-memo",
    "/admin/:path*",
    "/api/admin/:path*",
    "/authority/:path*",
    "/api/authority/:path*",
    "/team/:path*",
    "/api/team/:path*",
    "/api/account/:path*",
  ],
};
