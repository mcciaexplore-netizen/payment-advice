import { NextRequest, NextResponse } from "next/server";
import { refundRecommendationEnabled } from "@/lib/refund-requests";
import { getRefundAuthority } from "@/lib/advice/refund-authority-session";
import { decideRefund, refundDecisionSchema } from "@/lib/advice/refund-review";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A recommending authority recommends a refund that names them, or sends it
 * back with remarks. 404 while refund recommendation is off, 401 for anyone
 * who is not an authority account, 404 for a refund that does not name this
 * authority, 409 once it has been decided. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!refundRecommendationEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const authority = await getRefundAuthority();
  if (!authority) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = refundDecisionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const recommend = parsed.data.decision === "RECOMMEND";
  const result = await decideRefund({
    refundId: id,
    authority,
    decision: recommend ? "RECOMMENDED" : "SENT_BACK",
    remarks: recommend ? null : parsed.data.remarks ?? null,
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    origin: new URL(req.url).origin,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
