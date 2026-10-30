import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { receiveAdvice } from "@/lib/advice/finance-stage-actions";

export const runtime = "nodejs";

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/**
 * Step 1 of the Finance Verification + Sanctioning pipeline: the
 * "Received & In Process" marker. Since 2026-10-30 the audit entry names
 * the Finance user from the session (it used to say "ADMIN"). The logic
 * lives in lib/advice/finance-stage-actions.ts, shared with the bulk action.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const result = await receiveAdvice(id, session.fullName, { ip: clientIp(req) });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, financeReceivedAt: result.data.financeReceivedAt.toISOString() });
}
