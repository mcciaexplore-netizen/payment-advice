import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog, forwardingMemos } from "@/lib/db/schema";
import { getAdminSession } from "@/lib/admin-session";

export const runtime = "nodejs";

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/** Single-step acknowledgment, not a staged pipeline (no Received -> In
 * Process -> Verified chain like Payment Advice/Cash Voucher) - a Forwarding
 * Memo only ever goes from unreceived to received, recorded with who did it,
 * same `session.fullName` auto-attribution convention as Payment Advice's
 * `verified_by`. Gated by proxy.ts's existing /api/admin/* Finance-role
 * check - no route-local role check needed, same as every other
 * /api/admin/advice/[id]/* action route. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const [memo] = await db
    .select({ receivedAt: forwardingMemos.receivedAt, serialNo: forwardingMemos.serialNo })
    .from(forwardingMemos)
    .where(eq(forwardingMemos.id, id))
    .limit(1);
  if (!memo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (memo.receivedAt) {
    return NextResponse.json({ error: "Already marked received." }, { status: 409 });
  }

  const receivedBy = session.fullName;
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(forwardingMemos)
      .set({ receivedAt: now, receivedBy })
      .where(eq(forwardingMemos.id, id));

    await tx.insert(auditLog).values({
      forwardingMemoId: id,
      action: "FORWARDING_MEMO_RECEIVED",
      actor: receivedBy,
      ipAddress: clientIp(req),
      details: { serialNo: memo.serialNo, receivedBy },
    });
  });

  return NextResponse.json({ ok: true, receivedAt: now.toISOString(), receivedBy });
}
