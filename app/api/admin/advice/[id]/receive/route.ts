import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { paymentAdvices, auditLog } from "@/lib/db/schema";

export const runtime = "nodejs";

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/**
 * Step 1 of the Finance Verification + Sanctioning pipeline: a simple
 * "Received & In Process" marker, no named person attached (unlike Verify
 * and Sanction below, which each record who did it).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [advice] = await db
    .select({
      status: paymentAdvices.status,
      authorityApprovedAt: paymentAdvices.authorityApprovedAt,
      financeReceivedAt: paymentAdvices.financeReceivedAt,
    })
    .from(paymentAdvices)
    .where(eq(paymentAdvices.id, id))
    .limit(1);
  if (!advice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!advice.authorityApprovedAt) {
    return NextResponse.json(
      { error: "Awaiting Recommending Authority approval first." },
      { status: 409 },
    );
  }
  if (advice.financeReceivedAt) {
    return NextResponse.json(
      { error: "Already marked Received & In Process." },
      { status: 409 },
    );
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(paymentAdvices)
      .set({ financeReceivedAt: now, updatedAt: now })
      .where(eq(paymentAdvices.id, id));

    await tx.insert(auditLog).values({
      paymentAdviceId: id,
      action: "FINANCE_RECEIVED",
      actor: "ADMIN",
      ipAddress: clientIp(req),
      details: {},
    });
  });

  return NextResponse.json({ ok: true, financeReceivedAt: now.toISOString() });
}
