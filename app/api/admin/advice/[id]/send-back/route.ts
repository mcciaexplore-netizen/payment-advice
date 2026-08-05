import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { paymentAdvices } from "@/lib/db/schema";
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
  );

  return NextResponse.json({ editToken });
}
