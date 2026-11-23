import { NextResponse } from "next/server";
import { clearSessionCookies } from "@/lib/app-hub";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearSessionCookies(response);
  return response;
}
