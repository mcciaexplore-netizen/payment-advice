import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, decodeAdminSessionToken } from "@/lib/auth";

const PUBLIC_ADMIN_PATHS = new Set(["/admin/login", "/api/admin/login"]);
const PUBLIC_AUTHORITY_PATHS = new Set(["/authority/login", "/api/authority/login"]);

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const session = token ? await decodeAdminSessionToken(token) : null;
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
    if (pathname === "/authority/login" && session?.adminRole === "AUTHORITY") {
      return NextResponse.redirect(new URL("/authority", req.url), 302);
    }
    return NextResponse.next();
  }

  if (isAuthorityPath) {
    if (!session || session.adminRole !== "AUTHORITY" || !session.recommendingAuthorityId) {
      if (pathname.startsWith("/api/authority/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/authority/login", req.url), 302);
    }
    return NextResponse.next();
  }

  if (PUBLIC_ADMIN_PATHS.has(pathname)) {
    if (pathname === "/admin/login" && session && session.adminRole !== "AUTHORITY") {
      return NextResponse.redirect(new URL("/admin", req.url), 302);
    }
    return NextResponse.next();
  }

  if (!session || session.adminRole === "AUTHORITY") {
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
    "/admin/:path*",
    "/api/admin/:path*",
    "/authority/:path*",
    "/api/authority/:path*",
    "/api/account/:path*",
  ],
};
