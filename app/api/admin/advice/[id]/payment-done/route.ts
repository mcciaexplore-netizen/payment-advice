import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { paymentAdvices, auditLog } from "@/lib/db/schema";
import { billPassedForSchema, PaymentMode } from "@/lib/validation/payment-advice";
import { displayNoFor, documentLabelFor } from "@/lib/advice/document-identity";
import { getAdminSession } from "@/lib/admin-session";
import { notifyPaymentDone } from "@/lib/email/notify";

export const runtime = "nodejs";

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/**
 * Replaces the retired Sanction step as the terminal action (see
 * AGENT_HANDOFF.md — sanctioning now happens physically/offline, the app no
 * longer gates on it). Fires the moment Finance has actually paid, not a
 * moment earlier. `payment_done_by` is auto-attributed from the logged-in
 * Admin's session, same pattern as Verify — no picker.
 *
 * Not backend-role-gated to a specific admin_users.role (e.g. PAYMENT_ADVICE
 * vs CASH_VOUCHER) — per the human's explicit "default filter, not an
 * authorization wall" decision for this whole feature, the UI only shows
 * this button to whichever role owns that submission's payment mode (or the
 * ALL-role account); any signed-in Admin session can still call this route
 * directly. Requires "Bill passed for Rs." to already be saved, same
 * validation Sanction used to enforce — that requirement isn't specific to
 * the old Sanction UI, it's a real business rule (never finalize a payment
 * without a passed amount), so it moved here rather than being dropped.
 *
 * Dual-writes the legacy `status`/`approved_at`/`approved_by_name` fields
 * exactly as Sanction used to (human-confirmed judgment call, see
 * AGENT_HANDOFF.md) so Excel export and the Payment Advice PDF's "Approved
 * on" line keep working unchanged, now reflecting Payment Done instead of
 * Sanction.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const [advice] = await db
    .select({
      status: paymentAdvices.status,
      serialNo: paymentAdvices.serialNo,
      cashVoucherNo: paymentAdvices.cashVoucherNo,
      submittedByName: paymentAdvices.submittedByName,
      submittedByEmail: paymentAdvices.submittedByEmail,
      payeeName: paymentAdvices.payeeName,
      amount: paymentAdvices.amount,
      formDate: paymentAdvices.formDate,
      paymentMode: paymentAdvices.paymentMode,
      billPassedFor: paymentAdvices.billPassedFor,
      verifiedAt: paymentAdvices.verifiedAt,
      paymentDoneAt: paymentAdvices.paymentDoneAt,
    })
    .from(paymentAdvices)
    .where(eq(paymentAdvices.id, id))
    .limit(1);
  if (!advice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!advice.verifiedAt) {
    return NextResponse.json(
      { error: "Must be verified before Payment Done." },
      { status: 409 },
    );
  }
  if (advice.paymentDoneAt || advice.status === "APPROVED") {
    return NextResponse.json({ error: "Already marked Payment Done." }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  const billPassedForInput =
    typeof (body as { billPassedFor?: unknown })?.billPassedFor === "number"
      ? (body as { billPassedFor: number }).billPassedFor
      : advice.billPassedFor
        ? Number(advice.billPassedFor)
        : undefined;
  if (billPassedForInput === undefined) {
    return NextResponse.json(
      { error: "Bill passed for Rs. must be filled before marking Payment Done." },
      { status: 400 },
    );
  }
  const amountCheck = billPassedForSchema(Number(advice.amount)).safeParse(billPassedForInput);
  if (!amountCheck.success) {
    return NextResponse.json(
      { error: amountCheck.error.issues[0]?.message ?? "Invalid amount" },
      { status: 400 },
    );
  }

  const paymentDoneBy = session.fullName;
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(paymentAdvices)
      .set({
        paymentDoneAt: now,
        paymentDoneBy,
        billPassedFor: amountCheck.data.toFixed(2),
        status: "APPROVED",
        approvedAt: now,
        approvedByName: paymentDoneBy,
        updatedAt: now,
      })
      .where(eq(paymentAdvices.id, id));

    await tx.insert(auditLog).values({
      paymentAdviceId: id,
      action: "PAYMENT_DONE",
      actor: paymentDoneBy,
      ipAddress: clientIp(req),
      details: { paymentDoneBy, billPassedFor: amountCheck.data },
    });
  });

  await notifyPaymentDone(
    {
      displayNo: displayNoFor(advice.paymentMode as PaymentMode, advice.serialNo, advice.cashVoucherNo),
      submittedByName: advice.submittedByName,
      documentLabel: documentLabelFor(advice.paymentMode as PaymentMode),
      payeeName: advice.payeeName,
      amount: Number(advice.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 }),
      formDate: advice.formDate,
    },
    advice.submittedByEmail,
  );

  return NextResponse.json({ ok: true, paymentDoneAt: now.toISOString() });
}
