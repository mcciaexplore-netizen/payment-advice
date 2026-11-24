import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { auditLog, recommendingAuthorities, refundRequestReviews, refundRequests } from "@/lib/db/schema";
import { notifyRefundAuthority, notifyRefundRecommended, notifyRefundSentBack, notifyRefundSubmitted } from "@/lib/email/notify";
import { authorityNamedWhere, refundsForAuthorityWhere } from "@/lib/advice/refund-authority";

export type RefundDecision = "RECOMMENDED" | "SENT_BACK";

/** What the authority sends: Recommend, or Send back with remarks (required). */
export const refundDecisionSchema = z
  .object({
    decision: z.enum(["RECOMMEND", "SEND_BACK"]),
    remarks: z.string().trim().max(1000).optional(),
  })
  .refine((value) => value.decision === "RECOMMEND" || Boolean(value.remarks), {
    message: "Remarks are required to send a refund back.",
    path: ["remarks"],
  });

/** Where a refund stands, from its review row (none = still waiting). */
export function refundStatusLabel(review: { decision: string | null; decidedAt: Date | null; decidedByName: string | null } | null | undefined): string {
  if (!review?.decision) return "Waiting for recommendation";
  const when = review.decidedAt ? ` on ${review.decidedAt.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" })}` : "";
  return review.decision === "RECOMMENDED" ? `Recommended${when}` : `Sent back${when}`;
}

export type DecideResult = { ok: true } | { ok: false; status: 404 | 409; error: string };

/** Records one authority's decision on one refund. Returns 404 when the refund
 * does not name this authority (so one authority can never act on another's
 * refund, even with its id), and 409 when it has already been decided: a
 * refund is decided once, and a sent-back refund is replaced by a new one.
 * The decision and its audit entry are written together; the email to the
 * submitter afterwards never fails the decision. */
export async function decideRefund(input: {
  refundId: string;
  authority: { id: string; name: string };
  decision: RefundDecision;
  remarks: string | null;
  ipAddress: string | null;
  origin: string;
}): Promise<DecideResult> {
  const [refund] = await db
    .select({
      id: refundRequests.id, serialNo: refundRequests.serialNo, requestDate: refundRequests.requestDate,
      submittedByName: refundRequests.submittedByName, submittedByEmail: refundRequests.submittedByEmail,
      payeeName: refundRequests.payeeName, totalAmount: refundRequests.totalAmount,
    })
    .from(refundRequests)
    .where(and(eq(refundRequests.id, input.refundId), refundsForAuthorityWhere(input.authority.name)))
    .limit(1);
  if (!refund) return { ok: false, status: 404, error: "Not found" };

  const recorded = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(refundRequestReviews)
      .values({
        refundRequestId: refund.id,
        decision: input.decision,
        decidedByName: input.authority.name,
        decidedByAuthorityId: input.authority.id,
        remarks: input.remarks,
      })
      .onConflictDoNothing()
      .returning({ id: refundRequestReviews.refundRequestId });
    if (rows.length === 0) return false;
    await tx.insert(auditLog).values({
      refundRequestId: refund.id,
      action: input.decision === "RECOMMENDED" ? "REFUND_REQUEST_RECOMMENDED" : "REFUND_REQUEST_SENT_BACK",
      actor: input.authority.name,
      ipAddress: input.ipAddress,
      details: { serialNo: refund.serialNo, remarks: input.remarks },
    });
    return true;
  });
  if (!recorded) return { ok: false, status: 409, error: "This refund request has already been decided." };

  const amount = Number(refund.totalAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 });
  try {
    if (input.decision === "RECOMMENDED") {
      await notifyRefundRecommended(
        { displayNo: refund.serialNo, submittedByName: refund.submittedByName, payeeName: refund.payeeName, amount, recommendedBy: input.authority.name, requestDate: refund.requestDate },
        refund.submittedByEmail,
        refund.id,
      );
    } else {
      await notifyRefundSentBack(
        { displayNo: refund.serialNo, submittedByName: refund.submittedByName, payeeName: refund.payeeName, amount, sentBackBy: input.authority.name, remarks: input.remarks ?? "", newRefundLink: `${input.origin}/refund` },
        refund.submittedByEmail,
        refund.id,
      );
    }
  } catch (error) {
    console.error("[Refund] decision recorded but the email to the submitter failed", error);
  }
  return { ok: true };
}

/** Emails sent when a refund is saved: the recommending authority is asked to
 * review it (a link to the review page, sign-in required), and the submitter
 * gets a confirmation. Best effort: a missing authority email or a failed send
 * is logged and never fails the submission. */
export async function notifyRefundSubmission(input: {
  id: string;
  serialNo: string;
  requestDate: string;
  submittedByName: string;
  submittedByEmail: string;
  payeeName: string;
  natureOfExpenditure: string;
  totalAmount: string | number;
  recommendingAuthority: string;
  origin: string;
}): Promise<void> {
  try {
    const [authority] = await db
      .select({ name: recommendingAuthorities.authorityName, email: recommendingAuthorities.email })
      .from(recommendingAuthorities)
      .where(authorityNamedWhere(input.recommendingAuthority))
      .limit(1);
    const amount = Number(input.totalAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 });
    const authorityName = authority?.name ?? input.recommendingAuthority;
    await notifyRefundAuthority(
      { displayNo: input.serialNo, authorityName, submittedByName: input.submittedByName, payeeName: input.payeeName, amount, natureOfExpenditure: input.natureOfExpenditure, requestDate: input.requestDate, reviewLink: `${input.origin}/authority/refund/${input.id}` },
      authority?.email ?? null,
      input.id,
    );
    await notifyRefundSubmitted(
      { displayNo: input.serialNo, authorityName, submittedByName: input.submittedByName, payeeName: input.payeeName, amount, requestDate: input.requestDate, myRefundsLink: `${input.origin}/authority?view=my-refunds` },
      input.submittedByEmail,
      input.id,
    );
  } catch (error) {
    console.error("[Refund] saved, but the notification emails failed", error);
  }
}
