import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { dashboardLinksFor } from "@/lib/desk-dashboards";

export const runtime = "nodejs";

/** Who is signed in, for the Payment Desk's Login menu: the caller's own
 * name and the dashboards their own session can open. Nothing about anyone
 * else, and nothing when signed out. */
export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ signedIn: false }, { headers: { "Cache-Control": "private, no-store" } });
  return NextResponse.json(
    { signedIn: true, fullName: session.fullName, dashboards: dashboardLinksFor(session.roles) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
