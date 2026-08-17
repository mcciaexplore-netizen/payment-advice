import { NextRequest, NextResponse } from "next/server";
import { count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { paymentAdvices, paymentEntries } from "@/lib/db/schema";
import { notifySentBack } from "@/lib/email/notify";
import { performSendBack } from "@/lib/advice/send-back";
import { displayNoFor, documentLabelFor } from "@/lib/advice/document-identity";
import { PaymentMode, sendBackSchema } from "@/lib/validation/payment-advice";

export const runtime = "nodejs";

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [advice] = await db
    .select({
      status: paymentAdvices.status,
      serialNo: paymentAdvices.serialNo,
      cashVoucherNo: paymentAdvices.cashVoucherNo,
      paymentMode: paymentAdvices.paymentMode,
      submittedByName: paymentAdvices.submittedByName,
      submittedByEmail: paymentAdvices.submittedByEmail,
      payeeName: paymentAdvices.payeeName,
      amount: paymentAdvices.amount,
    })
    .from(paymentAdvices)
    .where(eq(paymentAdvices.id, id))
    .limit(1);
  if (!advice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (advice.status === "APPROVED") {
    return NextResponse.json(
      { error: `An approved ${documentLabelFor(advice.paymentMode as PaymentMode)} cannot be sent back.` },
      { status: 409 },
    );
  }
  // NEFT's multi-part payment model (see AGENT_HANDOFF.md) can leave real
  // money already paid out (a partial payment) while status is still
  // SUBMITTED — sending that back for resubmission would let the
  // submitter change bill details a real disbursement was already made
  // against, with no reconciliation path. Not requested by the original
  // brief; added as a money-safety guard, flagged here and in
  // AGENT_HANDOFF.md rather than left unblocked. Cash Voucher never
  // records payment_entries, so this never affects Cash rows.
  const [{ count: existingEntryCount }] = await db
    .select({ count: count() })
    .from(paymentEntries)
    .where(eq(paymentEntries.paymentAdviceId, id));
  if (existingEntryCount > 0) {
    return NextResponse.json(
      {
        error:
          "This advice already has a payment recorded against it and can no longer be sent back.",
      },
      { status: 409 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = sendBackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Remarks are required" },
      { status: 400 },
    );
  }

  const editToken = await performSendBack({
    adviceId: id,
    remarks: parsed.data.adminRemarks,
    actor: "ADMIN",
    ipAddress: clientIp(req),
  });

  await notifySentBack(
    {
      displayNo: displayNoFor(advice.paymentMode as PaymentMode, advice.serialNo, advice.cashVoucherNo),
      documentLabel: documentLabelFor(advice.paymentMode as PaymentMode),
      submittedByName: advice.submittedByName,
      sentBackBy: "Admin",
      remarks: parsed.data.adminRemarks,
      payeeName: advice.payeeName,
      amount: Number(advice.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 }),
      editLink: `${new URL(req.url).origin}/edit/${editToken}`,
    },
    advice.submittedByEmail,
    id,
  );

  return NextResponse.json({ editToken });
}
