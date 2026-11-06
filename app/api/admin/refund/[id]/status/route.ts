import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { auditLog, refundRequests } from "@/lib/db/schema";
import { getAdminSession } from "@/lib/admin-session";
import { hasFinanceRole } from "@/lib/auth";
import { notifySentBack } from "@/lib/email/notify";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bodySchema = z.object({
  action: z.enum(["SEND_BACK", "CANCEL"]),
  remarks: z.string().trim().min(1, "Remarks are required").max(1000),
});

/** Finance review of a Refund request: send it back to the submitter (who
 * gets the remarks by email and files a corrected request) or cancel it.
 * Either way the request stays on file with the new status, the remarks and
 * an audit entry. Only a still-SUBMITTED request can be actioned. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!hasFinanceRole(session)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const { action, remarks } = parsed.data;

  const [refund] = await db
    .select({
      status: refundRequests.status,
      serialNo: refundRequests.serialNo,
      submittedByName: refundRequests.submittedByName,
      submittedByEmail: refundRequests.submittedByEmail,
      payeeName: refundRequests.payeeName,
      totalAmount: refundRequests.totalAmount,
    })
    .from(refundRequests)
    .where(eq(refundRequests.id, id))
    .limit(1);
  if (!refund) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (refund.status !== "SUBMITTED") {
    return NextResponse.json({ error: "This request has already been sent back or cancelled." }, { status: 409 });
  }

  const status = action === "SEND_BACK" ? "SENT_BACK" : "CANCELLED";
  await db.transaction(async (tx) => {
    await tx
      .update(refundRequests)
      .set({ status, statusRemarks: remarks, statusChangedAt: new Date() })
      .where(eq(refundRequests.id, id));
    await tx.insert(auditLog).values({
      refundRequestId: id,
      action: action === "SEND_BACK" ? "REFUND_REQUEST_SENT_BACK" : "REFUND_REQUEST_CANCELLED",
      actor: "ADMIN",
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      details: { serialNo: refund.serialNo, remarks },
    });
  });

  if (action === "SEND_BACK") {
    // The submitter fixes the problem by filing a corrected Refund request.
    await notifySentBack(
      {
        displayNo: refund.serialNo,
        documentLabel: "Refund Request",
        submittedByName: refund.submittedByName,
        sentBackBy: "Finance",
        remarks,
        payeeName: refund.payeeName,
        amount: Number(refund.totalAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 }),
        editLink: `${new URL(req.url).origin}/refund`,
      },
      refund.submittedByEmail,
    ).catch((error) => console.error("[Refund] send-back email failed", error));
  }

  return NextResponse.json({ status });
}
