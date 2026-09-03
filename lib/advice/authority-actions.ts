import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog, paymentAdvices } from "@/lib/db/schema";
import { performSendBack } from "@/lib/advice/send-back";
import { displayNoFor, documentLabelFor } from "@/lib/advice/document-identity";
import { notifySentBack } from "@/lib/email/notify";
import { PaymentMode } from "@/lib/validation/payment-advice";

export type AuthorityActionState = {
  id: string;
  authorityApprovedAt: Date | null;
  authorityRejectedAt: Date | null;
  authorityTokenExpiresAt: Date | null;
};

export async function performAuthorityApproval(input: {
  advice: AuthorityActionState;
  actor: string;
  ipAddress: string | null;
}) {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(paymentAdvices)
      .set({ authorityApprovedAt: now, updatedAt: now })
      .where(eq(paymentAdvices.id, input.advice.id));
    await tx.insert(auditLog).values({
      paymentAdviceId: input.advice.id,
      action: "AUTHORITY_APPROVED",
      actor: input.actor,
      ipAddress: input.ipAddress,
      details: {},
    });
  });
  return now;
}

export async function performAuthorityRejection(input: {
  advice: AuthorityActionState & {
    serialNo: string;
    cashVoucherNo: string | null;
    isAdvance: boolean;
    advanceNo: string | null;
    paymentMode: string;
    submittedByName: string;
    submittedByEmail: string;
    payeeName: string;
    amount: string;
  };
  actor: string;
  remarks: string;
  ipAddress: string | null;
  origin: string;
}) {
  const editToken = await performSendBack({
    adviceId: input.advice.id,
    remarks: input.remarks,
    actor: input.actor,
    ipAddress: input.ipAddress,
    authorityRejection: true,
  });

  await notifySentBack(
    {
      displayNo: displayNoFor(
        input.advice.paymentMode as PaymentMode,
        input.advice.serialNo,
        input.advice.cashVoucherNo,
        input.advice.isAdvance,
        input.advice.advanceNo,
      ),
      documentLabel: documentLabelFor(
        input.advice.paymentMode as PaymentMode,
        input.advice.isAdvance,
      ),
      submittedByName: input.advice.submittedByName,
      sentBackBy: input.actor,
      remarks: input.remarks,
      payeeName: input.advice.payeeName,
      amount: Number(input.advice.amount).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
      }),
      editLink: `${input.origin}/edit/${editToken}`,
    },
    input.advice.submittedByEmail,
    input.advice.id,
  );
}
