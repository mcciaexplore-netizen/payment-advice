import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { paymentAdvices, vendorRequests, auditLog } from "@/lib/db/schema";
import { performSendBack } from "@/lib/advice/send-back";
import { notifySentBack } from "@/lib/email/notify";
import { displayNoFor, documentLabelFor } from "@/lib/advice/document-identity";
import { PaymentMode, sendBackSchema } from "@/lib/validation/payment-advice";
import { getAdminSession } from "@/lib/admin-session";
import { hasFinanceRole } from "@/lib/auth";

export const runtime = "nodejs";

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

// Reuses the same Send Back mechanism as Admin's own PA action (see
// app/api/admin/advice/[id]/send-back/route.ts) - this just also marks the
// linked vendor_requests row sent-back, atomically with the PA itself, via
// performSendBack's onTransaction hook.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!hasFinanceRole(session)) {
    return NextResponse.json(
      { error: "Your account cannot send back vendor requests." },
      { status: 403 },
    );
  }

  const [request] = await db
    .select()
    .from(vendorRequests)
    .where(eq(vendorRequests.id, id))
    .limit(1);
  if (!request) {
    return NextResponse.json({ error: "Vendor request not found." }, { status: 404 });
  }
  if (request.approvedAt) {
    return NextResponse.json({ error: "Already approved." }, { status: 409 });
  }
  if (request.sentBackAt) {
    return NextResponse.json({ error: "Already sent back." }, { status: 409 });
  }

  const [advice] = await db
    .select({
      status: paymentAdvices.status,
      serialNo: paymentAdvices.serialNo,
      cashVoucherNo: paymentAdvices.cashVoucherNo,
      isAdvance: paymentAdvices.isAdvance,
      advanceNo: paymentAdvices.advanceNo,
      paymentMode: paymentAdvices.paymentMode,
      submittedByName: paymentAdvices.submittedByName,
      submittedByEmail: paymentAdvices.submittedByEmail,
      payeeName: paymentAdvices.payeeName,
      amount: paymentAdvices.amount,
      pendingVendorRequestId: paymentAdvices.pendingVendorRequestId,
    })
    .from(paymentAdvices)
    .where(eq(paymentAdvices.id, request.paymentAdviceId))
    .limit(1);
  if (!advice) {
    return NextResponse.json({ error: "Linked Payment Advice not found." }, { status: 404 });
  }
  if (advice.pendingVendorRequestId !== request.id) {
    return NextResponse.json(
      {
        error: "This request is no longer linked to its Payment Advice - the submitter likely picked a different vendor on resubmission.",
      },
      { status: 409 },
    );
  }
  if (advice.status === "APPROVED") {
    return NextResponse.json(
      {
        error: `An approved ${documentLabelFor(advice.paymentMode as PaymentMode, advice.isAdvance)} cannot be sent back.`,
      },
      { status: 409 },
    );
  }
  if (advice.status === "REJECTED") {
    return NextResponse.json({ error: "A rejected submission is permanently closed." }, { status: 409 });
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
    adviceId: request.paymentAdviceId,
    remarks: parsed.data.adminRemarks,
    actor: session.fullName,
    ipAddress: clientIp(req),
    onTransaction: async (tx) => {
      const now = new Date();
      await tx
        .update(vendorRequests)
        .set({
          sentBackAt: now,
          sentBackBy: session.fullName,
          sentBackRemarks: parsed.data.adminRemarks,
        })
        .where(eq(vendorRequests.id, request.id));

      await tx.insert(auditLog).values({
        paymentAdviceId: request.paymentAdviceId,
        vendorRequestId: request.id,
        action: "VENDOR_REQUEST_SENT_BACK",
        actor: session.fullName,
        ipAddress: clientIp(req),
        details: { remarks: parsed.data.adminRemarks },
      });
    },
  });

  await notifySentBack(
    {
      displayNo: displayNoFor(
        advice.paymentMode as PaymentMode,
        advice.serialNo,
        advice.cashVoucherNo,
        advice.isAdvance,
        advice.advanceNo,
      ),
      documentLabel: documentLabelFor(advice.paymentMode as PaymentMode, advice.isAdvance),
      submittedByName: advice.submittedByName,
      sentBackBy: session.fullName,
      remarks: parsed.data.adminRemarks,
      payeeName: advice.payeeName,
      amount: Number(advice.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 }),
      editLink: `${new URL(req.url).origin}/edit/${editToken}`,
    },
    advice.submittedByEmail,
    request.paymentAdviceId,
  );

  return NextResponse.json({ editToken });
}
