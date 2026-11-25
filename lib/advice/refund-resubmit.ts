import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminUsers, auditLog, refundRequestReviews, refundRequests } from "@/lib/db/schema";
import { getAdminSession } from "@/lib/admin-session";
import { myRefundsWhere } from "@/lib/advice/my-refunds";
import { notifyRefundSubmission } from "@/lib/advice/refund-review";
import { refundAmounts, refundRequestSchema, type RefundRequestInput } from "@/lib/validation/refund-request";

type StoredDocument = RefundRequestInput["documents"][number];

/** The signed-in person's login email (the same email My Third Party Refunds
 * matches on), or null when nobody is signed in. */
export async function getSessionEmail(): Promise<string | null> {
  const session = await getAdminSession();
  if (!session) return null;
  const [account] = await db.select({ email: adminUsers.email }).from(adminUsers).where(eq(adminUsers.id, session.adminUserId)).limit(1);
  return account?.email ?? null;
}

/** One refund the signed-in person submitted, with its review (if any).
 * Undefined when it does not exist or was submitted by someone else, so the
 * caller answers 404 either way. */
export async function loadOwnRefund(refundId: string, accountEmail: string) {
  const [found] = await db
    .select({ refund: refundRequests, review: refundRequestReviews })
    .from(refundRequests)
    .leftJoin(refundRequestReviews, eq(refundRequestReviews.refundRequestId, refundRequests.id))
    .where(and(eq(refundRequests.id, refundId), myRefundsWhere(accountEmail)))
    .limit(1);
  return found;
}

/** Fields the submitter may change when resubmitting. Who submitted it, the
 * branch and the recommending authority stay as stored, so the refund goes
 * back to the same authority and stays tied to the same login. */
export type RefundEdits = Omit<Record<keyof RefundRequestInput, unknown>, "submittedByName" | "submittedByEmail" | "submittedByDepartment" | "branch" | "recommendingAuthority" | "documents">;

/** Documents after an edit: the stored ones the submitter kept, with a newly
 * uploaded Email copy or Cancelled cheque replacing the stored one of that
 * type, and new Other documents added. Stored documents always come from the
 * database row, never from the browser. */
export function mergeRefundDocuments(stored: StoredDocument[], keepIndexes: number[], added: StoredDocument[]): StoredDocument[] {
  const replacedTypes = new Set(added.filter((document) => document.type !== "OTHER").map((document) => document.type));
  const kept = stored.filter((document, index) => keepIndexes.includes(index) && !replacedTypes.has(document.type));
  return [...kept, ...added];
}

export type ResubmitResult =
  | { ok: true; serialNo: string }
  | { ok: false; status: 400 | 404 | 409; error: string };

/** The submitter edits and resubmits a refund the authority sent back. Same
 * row, same reference number, same request date and created date: nothing new
 * is numbered. In one transaction (row locked): the SENT_BACK review is
 * deleted, which puts the refund back in its authority's queue (a second
 * click finds no SENT_BACK review and gets 409); the edited fields are saved;
 * and a REFUND_REQUEST_RESUBMITTED audit entry records the remarks it answered
 * and which fields changed (the resubmission history lives in the audit log).
 * Then the authority is emailed to review it again (best effort). */
export async function resubmitRefund(input: {
  refundId: string;
  accountEmail: string;
  edits: RefundEdits;
  keepIndexes: number[];
  addedDocuments: unknown;
  verifyDocuments: (documents: StoredDocument[]) => Promise<string | null>;
  ipAddress: string | null;
  origin: string;
}): Promise<ResubmitResult> {
  const found = await loadOwnRefund(input.refundId, input.accountEmail);
  if (!found) return { ok: false, status: 404, error: "Not found" };
  const { refund, review } = found;
  if (review?.decision !== "SENT_BACK") {
    return { ok: false, status: 409, error: "This third party refund request is not waiting for your corrections." };
  }

  // Validate the whole request as stored plus the edits, against its original
  // request date (From Date may not be after it, as on the first submission).
  const added = Array.isArray(input.addedDocuments) ? input.addedDocuments : [];
  const parsedAdded = refundRequestSchema(refund.requestDate).shape.documents.safeParse(added);
  if (!parsedAdded.success) return { ok: false, status: 400, error: "Document details are invalid." };
  const documents = mergeRefundDocuments(refund.documents, input.keepIndexes, parsedAdded.data);
  const parsed = refundRequestSchema(refund.requestDate).safeParse({
    ...input.edits,
    submittedByName: refund.submittedByName,
    submittedByEmail: refund.submittedByEmail,
    submittedByDepartment: refund.submittedByDepartment,
    branch: refund.branch,
    recommendingAuthority: refund.recommendingAuthority,
    documents,
  });
  if (!parsed.success) return { ok: false, status: 400, error: parsed.error.issues[0]?.message ?? "Invalid third party refund details." };
  const documentError = parsedAdded.data.length ? await input.verifyDocuments(parsedAdded.data) : null;
  if (documentError) return { ok: false, status: 400, error: documentError };

  const values = parsed.data;
  const updates = {
    payeeName: values.payeeName,
    payeeAddress: values.payeeAddress || null,
    payeeContactPerson: values.payeeContactPerson || null,
    payeeContactPhone: values.payeeContactPhone || null,
    payeeEmail: values.payeeEmail || null,
    payeeGstin: values.payeeGstin || null,
    payeeUdyamNumber: values.payeeUdyamNumber || null,
    ...refundAmounts(values),
    natureOfExpenditure: values.natureOfExpenditure,
    fromDate: values.fromDate,
    bankName: values.bankName || null,
    beneficiaryName: values.beneficiaryName || null,
    bankAccountNo: values.bankAccountNo || null,
    bankIfsc: values.bankIfsc || null,
    enclosures: values.enclosures || null,
    specialRemarks: values.specialRemarks || null,
    documents: values.documents,
  };
  const changed = (Object.keys(updates) as Array<keyof typeof updates>).filter((key) => JSON.stringify(updates[key]) !== JSON.stringify(refund[key]));

  const resubmitted = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from refund_requests where id = ${refund.id} for update`);
    const cleared = await tx
      .delete(refundRequestReviews)
      .where(and(eq(refundRequestReviews.refundRequestId, refund.id), eq(refundRequestReviews.decision, "SENT_BACK")))
      .returning({ remarks: refundRequestReviews.remarks, decidedByName: refundRequestReviews.decidedByName });
    if (cleared.length === 0) return false;
    await tx.update(refundRequests).set(updates).where(eq(refundRequests.id, refund.id));
    await tx.insert(auditLog).values({
      refundRequestId: refund.id,
      action: "REFUND_REQUEST_RESUBMITTED",
      actor: refund.submittedByName,
      ipAddress: input.ipAddress,
      details: { serialNo: refund.serialNo, sentBackBy: cleared[0].decidedByName, sentBackRemarks: cleared[0].remarks, changed },
    });
    return true;
  });
  if (!resubmitted) return { ok: false, status: 409, error: "This third party refund request is not waiting for your corrections." };

  await notifyRefundSubmission({
    id: refund.id, serialNo: refund.serialNo, requestDate: refund.requestDate,
    submittedByName: refund.submittedByName, submittedByEmail: refund.submittedByEmail,
    payeeName: values.payeeName, natureOfExpenditure: values.natureOfExpenditure,
    totalAmount: refundAmounts(values).totalAmount, recommendingAuthority: refund.recommendingAuthority,
    origin: input.origin,
  });
  return { ok: true, serialNo: refund.serialNo };
}
