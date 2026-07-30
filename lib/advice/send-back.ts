import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { paymentAdvices, auditLog } from "@/lib/db/schema";

export const EDIT_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

/**
 * Shared by Admin's own "Send Back" action and the Recommending Authority's
 * "Send Back" action on the approval page — both put the submission back in
 * the submitter's hands via the same one-time edit-token flow. `actor` is
 * written to the audit log so the admin queue/detail view can tell which of
 * the two triggered a given SENT_BACK cycle. Pass `authorityRejection: true`
 * only when the Authority is the one rejecting, so authority_rejected_at /
 * authority_remarks get set alongside the generic admin_remarks field that
 * the /edit/[token] page already displays.
 */
export async function performSendBack({
  adviceId,
  remarks,
  actor,
  ipAddress,
  authorityRejection = false,
}: {
  adviceId: string;
  remarks: string;
  actor: string;
  ipAddress: string | null;
  authorityRejection?: boolean;
}): Promise<string> {
  const editToken = randomBytes(32).toString("base64url");
  const now = new Date();
  const editTokenExpiresAt = new Date(now.getTime() + EDIT_TOKEN_TTL_MS);

  await db.transaction(async (tx) => {
    await tx
      .update(paymentAdvices)
      .set({
        status: "SENT_BACK",
        sentBackAt: now,
        adminRemarks: remarks,
        editToken,
        editTokenExpiresAt,
        ...(authorityRejection
          ? { authorityRejectedAt: now, authorityRemarks: remarks }
          : {}),
        updatedAt: now,
      })
      .where(eq(paymentAdvices.id, adviceId));

    await tx.insert(auditLog).values({
      paymentAdviceId: adviceId,
      action: "SENT_BACK",
      actor,
      ipAddress,
      details: { adminRemarks: remarks },
    });
  });

  return editToken;
}
