import { NextRequest, NextResponse } from "next/server";
import { refundRecommendationEnabled } from "@/lib/refund-requests";
import { getRefundAuthority } from "@/lib/advice/refund-authority-session";
import { decideRefund, REFUND_DECISION_FOR, refundDecisionSchema } from "@/lib/advice/refund-review";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A recommending authority recommends a refund that names them, sends it
 * back, or rejects it (a reason is required for both). 404 while refund
 * recommendation is off, for anyone who is not an authority account, and for
 * a refund that does not name this authority; 409 when it is not waiting for
 * a decision (already decided, or a second click). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!refundRecommendationEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const authority = await getRefundAuthority();
  if (!authority) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = refundDecisionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const decision = REFUND_DECISION_FOR[parsed.data.decision];
  const result = await decideRefund({
    refundId: id,
    authority,
    decision,
    remarks: decision === "RECOMMENDED" ? null : parsed.data.remarks ?? null,
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    origin: new URL(req.url).origin,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
