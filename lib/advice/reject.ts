import { and, eq, isNull, notExists, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog, paymentAdvices, paymentEntries } from "@/lib/db/schema";
import { displayNoFor, documentLabelFor } from "@/lib/advice/document-identity";
import { notifySubmissionRejected } from "@/lib/email/notify";
import type { PaymentMode } from "@/lib/validation/payment-advice";

export type RejectableAdvice = {
  id: string; serialNo: string; cashVoucherNo: string | null; advanceNo: string | null;
  isAdvance: boolean; paymentMode: string; submittedByName: string; submittedByEmail: string;
  payeeName: string; amount: string;
};

export async function performFinalReject(input: { advice: RejectableAdvice; actor: string; remarks: string; ipAddress: string | null }) {
  const now = new Date();
  const rejected = await db.transaction(async (tx) => {
    const rows = await tx.update(paymentAdvices).set({
      status: "REJECTED", rejectedAt: now, rejectedBy: input.actor,
      rejectionRemarks: input.remarks, editToken: null, editTokenExpiresAt: null, updatedAt: now,
    }).where(and(
      eq(paymentAdvices.id, input.advice.id),
      or(eq(paymentAdvices.status, "SUBMITTED"), eq(paymentAdvices.status, "SENT_BACK")),
      isNull(paymentAdvices.paymentDoneAt),
      eq(paymentAdvices.totalPaid, "0"),
      notExists(tx.select({ id: paymentEntries.id }).from(paymentEntries).where(eq(paymentEntries.paymentAdviceId, input.advice.id))),
    )).returning({ id: paymentAdvices.id });
    if (rows.length === 0) return false;
    await tx.insert(auditLog).values({
      paymentAdviceId: input.advice.id, action: "REJECTED", actor: input.actor,
      ipAddress: input.ipAddress, details: { remarks: input.remarks },
    });
    return true;
  });
  if (!rejected) return null;
  const displayNo = displayNoFor(input.advice.paymentMode as PaymentMode, input.advice.serialNo, input.advice.cashVoucherNo, input.advice.isAdvance, input.advice.advanceNo);
  await notifySubmissionRejected({
    displayNo, documentLabel: documentLabelFor(input.advice.paymentMode as PaymentMode, input.advice.isAdvance),
    submittedByName: input.advice.submittedByName, rejectedBy: input.actor, remarks: input.remarks,
    payeeName: input.advice.payeeName, amount: Number(input.advice.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 }),
  }, input.advice.submittedByEmail, input.advice.id);
  return now;
}
