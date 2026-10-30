import { NextRequest, NextResponse } from "next/server";
import { receiveAdvice } from "@/lib/advice/finance-stage-actions";

export const runtime = "nodejs";

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/**
 * Step 1 of the Finance Verification + Sanctioning pipeline: a simple
 * "Received & In Process" marker, no named person attached (unlike Verify
 * and Sanction below, which each record who did it). The logic lives in
 * lib/advice/finance-stage-actions.ts, shared with the bulk action.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await receiveAdvice(id, { ip: clientIp(req) });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, financeReceivedAt: result.data.financeReceivedAt.toISOString() });
}
