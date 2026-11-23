import { NextResponse } from "next/server";
import { clearSessionCookies } from "@/lib/app-hub";

export const runtime = "nodejs";

/** Signs out of the Payment Desk (and every dashboard: they share one
 * session), whether it was opened on its own or inside the App Hub. */
export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearSessionCookies(response);
  return response;
}
