import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog, paymentAdvices } from "@/lib/db/schema";
import { getAdminSession } from "@/lib/admin-session";
import { gstSettlementSchema } from "@/lib/validation/payment-advice";

export const runtime = "nodejs";

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

type Result =
  | { ok: false; status: number; error: string }
  | { ok: true; gstSettledBy: string; gstSettledAt: Date };

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!session.roles.includes("PAYMENT_ADVICE") && !session.roles.includes("ALL")) {
    return NextResponse.json(
      { error: "Your account cannot record GST settlements." },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = gstSettlementSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid GST settlement" },
      { status: 400 },
    );
  }

  const result: Result = await db.transaction(async (tx) => {
    const locked = await tx.execute<{
      payment_mode: string;
      is_advance: boolean;
      gst_amount: string | null;
      verified_at: Date | null;
      status: string;
      gst_settled: boolean;
    }>(sql`
      select payment_mode, is_advance, gst_amount, verified_at, status, gst_settled
      from payment_advices
      where id = ${id}
      for update
    `);
    const advice = locked.rows[0];
    if (!advice) return { ok: false, status: 404, error: "Not found" };
    if (
      advice.payment_mode !== "NEFT" ||
      advice.is_advance ||
      Number(advice.gst_amount ?? 0) <= 0
    ) {
      return {
        ok: false,
        status: 409,
        error: "GST settlement tracking is only available for Payment Advice with GST.",
      };
    }
    if (!advice.verified_at) {
      return {
        ok: false,
        status: 409,
        error: "Verify this Payment Advice before recording GST settlement.",
      };
    }
    if (advice.status !== "SUBMITTED" && advice.status !== "APPROVED") {
      return {
        ok: false,
        status: 409,
        error: "GST settlement is unavailable while this submission is not active.",
      };
    }
    if (advice.gst_settled) {
      return { ok: false, status: 409, error: "GST has already been marked as settled." };
    }

    const now = new Date();
    await tx
      .update(paymentAdvices)
      .set({
        gstSettled: true,
        gstSettledBy: session.fullName,
        gstSettledAt: now,
        updatedAt: now,
      })
      .where(eq(paymentAdvices.id, id));
    await tx.insert(auditLog).values({
      paymentAdviceId: id,
      action: "GST_SETTLEMENT_RECORDED",
      actor: session.fullName,
      ipAddress: clientIp(req),
      details: { gstSettled: true },
    });

    return { ok: true, gstSettledBy: session.fullName, gstSettledAt: now };
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({
    ok: true,
    gstSettled: true,
    gstSettledBy: result.gstSettledBy,
    gstSettledAt: result.gstSettledAt.toISOString(),
  });
}
