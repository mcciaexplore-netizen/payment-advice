import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { paymentAdvices, auditLog } from "@/lib/db/schema";
import { notifyVerified } from "@/lib/email/notify";
import { verifySchema } from "@/lib/validation/payment-advice";

export const runtime = "nodejs";

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/** Step 2: Finance verifies, picking their name from the fixed 4-person
 * list. Notifies the submitter — see AGENT_HANDOFF.md for why Received and
 * Sanctioned deliberately do not send an email. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [advice] = await db
    .select({
      serialNo: paymentAdvices.serialNo,
      submittedByName: paymentAdvices.submittedByName,
      payeeName: paymentAdvices.payeeName,
      amount: paymentAdvices.amount,
      formDate: paymentAdvices.formDate,
      paymentMode: paymentAdvices.paymentMode,
      financeReceivedAt: paymentAdvices.financeReceivedAt,
      verifiedAt: paymentAdvices.verifiedAt,
    })
    .from(paymentAdvices)
    .where(eq(paymentAdvices.id, id))
    .limit(1);
  if (!advice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!advice.financeReceivedAt) {
    return NextResponse.json(
      { error: "Must be marked Received & In Process before it can be verified." },
      { status: 409 },
    );
  }
  if (advice.verifiedAt) {
    return NextResponse.json({ error: "Already verified." }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid data" },
      { status: 400 },
    );
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(paymentAdvices)
      .set({ verifiedAt: now, verifiedBy: parsed.data.verifiedBy, updatedAt: now })
      .where(eq(paymentAdvices.id, id));

    await tx.insert(auditLog).values({
      paymentAdviceId: id,
      action: "VERIFIED",
      actor: parsed.data.verifiedBy,
      ipAddress: clientIp(req),
      details: { verifiedBy: parsed.data.verifiedBy },
    });
  });

  notifyVerified({
    serialNo: advice.serialNo,
    submittedByName: advice.submittedByName,
    verifiedBy: parsed.data.verifiedBy,
    documentLabel: advice.paymentMode === "CASH" ? "Cash Payment Voucher" : "Payment Advice",
    payeeName: advice.payeeName,
    amount: Number(advice.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 }),
    formDate: advice.formDate,
  });

  return NextResponse.json({ ok: true, verifiedAt: now.toISOString() });
}
