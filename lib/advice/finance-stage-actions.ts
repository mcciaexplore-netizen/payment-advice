import { and, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog, paymentAdvices, paymentEntries } from "@/lib/db/schema";
import { billPassedForSchema, paymentEntrySchema, type PaymentMode } from "@/lib/validation/payment-advice";
import { billPassedForLabelFor, displayNoFor, documentLabelFor } from "@/lib/advice/document-identity";
import { notifyPaymentDone, notifyPaymentEntry, notifyVerified } from "@/lib/email/notify";
import type { AdminRole } from "@/lib/auth";
import { ownsSubmissionType } from "@/lib/admin/role-scope";

/** The Finance stage actions (Received, Verified, Cash Payment Done, NEFT
 * Record a Payment), shared by the single-item routes under
 * app/api/admin/advice/[id]/ and the bulk route, so both run the exact same
 * checks, writes, audit entries and emails. Moved here unchanged from the
 * routes (2026-10-30) with one hardening: each write is conditional on the
 * stage still being open (e.g. finance_received_at IS NULL), so a double
 * click or two Finance users acting at once can never process or email the
 * same item twice; the loser gets the same 409 an already-done item gets.
 *
 * 2026-10-30 rule changes (owner approved): payments are enforced by role
 * here for single and bulk alike (Cash: CASH_VOUCHER or ALL; NEFT:
 * PAYMENT_ADVICE or ALL; previously a UI-only default), and Received now
 * records the named Finance user instead of "ADMIN". */

/** 403 text when a role does not own the submission's payment mode. */
export function paymentRoleError(paymentMode: string): string {
  return paymentMode === "CASH"
    ? "Only a Cash Voucher account (or an All-Access account) can mark this Payment Done."
    : "Only a Payment Advice account (or an All-Access account) can record a payment.";
}

export type StageActionResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

/** Audit context. `extra` is merged into the audit details; bulk uses it to
 * record that the action came from a bulk batch. */
export type StageActionContext = { ip: string | null; extra?: Record<string, unknown> };

const fail = (status: number, error: string) => ({ ok: false as const, status, error });

function money(value: number): string {
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2 });
}

/** Step 1: "Received & In Process". Records the Finance user who did it in
 * the audit entry; no email (unchanged). */
export async function receiveAdvice(id: string, receivedBy: string, ctx: StageActionContext): Promise<StageActionResult<{ financeReceivedAt: Date }>> {
  const [advice] = await db
    .select({
      status: paymentAdvices.status,
      authorityApprovedAt: paymentAdvices.authorityApprovedAt,
      financeReceivedAt: paymentAdvices.financeReceivedAt,
    })
    .from(paymentAdvices)
    .where(eq(paymentAdvices.id, id))
    .limit(1);
  if (!advice) return fail(404, "Not found");
  if (!advice.authorityApprovedAt) return fail(409, "Awaiting Recommending Authority recommendation first.");
  if (advice.financeReceivedAt) return fail(409, "Already marked Received & In Process.");

  const now = new Date();
  const done = await db.transaction(async (tx) => {
    const updated = await tx
      .update(paymentAdvices)
      .set({ financeReceivedAt: now, updatedAt: now })
      .where(and(eq(paymentAdvices.id, id), isNull(paymentAdvices.financeReceivedAt)))
      .returning({ id: paymentAdvices.id });
    if (updated.length === 0) return false;
    await tx.insert(auditLog).values({
      paymentAdviceId: id,
      action: "FINANCE_RECEIVED",
      actor: receivedBy,
      ipAddress: ctx.ip,
      details: { receivedBy, ...ctx.extra },
    });
    return true;
  });
  if (!done) return fail(409, "Already marked Received & In Process.");
  return { ok: true, data: { financeReceivedAt: now } };
}

/** Step 2: Finance verifies; verified_by is the session user; emails the submitter. */
export async function verifyAdvice(id: string, verifiedBy: string, ctx: StageActionContext): Promise<StageActionResult<{ verifiedAt: Date }>> {
  const [advice] = await db
    .select({
      serialNo: paymentAdvices.serialNo,
      cashVoucherNo: paymentAdvices.cashVoucherNo,
      isAdvance: paymentAdvices.isAdvance,
      advanceNo: paymentAdvices.advanceNo,
      submittedByName: paymentAdvices.submittedByName,
      submittedByEmail: paymentAdvices.submittedByEmail,
      payeeName: paymentAdvices.payeeName,
      amount: paymentAdvices.amount,
      formDate: paymentAdvices.formDate,
      paymentMode: paymentAdvices.paymentMode,
      financeReceivedAt: paymentAdvices.financeReceivedAt,
      verifiedAt: paymentAdvices.verifiedAt,
    })
    .from(paymentAdvices)
    .where(eq(paymentAdvices.id, id))
    .limit(1);
  if (!advice) return fail(404, "Not found");
  if (!advice.financeReceivedAt) return fail(409, "Must be marked Received & In Process before it can be verified.");
  if (advice.verifiedAt) return fail(409, "Already verified.");

  const now = new Date();
  const done = await db.transaction(async (tx) => {
    const updated = await tx
      .update(paymentAdvices)
      .set({ verifiedAt: now, verifiedBy, updatedAt: now })
      .where(and(eq(paymentAdvices.id, id), isNotNull(paymentAdvices.financeReceivedAt), isNull(paymentAdvices.verifiedAt)))
      .returning({ id: paymentAdvices.id });
    if (updated.length === 0) return false;
    await tx.insert(auditLog).values({
      paymentAdviceId: id,
      action: "VERIFIED",
      actor: verifiedBy,
      ipAddress: ctx.ip,
      details: { verifiedBy, ...ctx.extra },
    });
    return true;
  });
  if (!done) return fail(409, "Already verified.");

  await notifyVerified(
    {
      displayNo: displayNoFor(advice.paymentMode as PaymentMode, advice.serialNo, advice.cashVoucherNo, advice.isAdvance, advice.advanceNo),
      submittedByName: advice.submittedByName,
      verifiedBy,
      documentLabel: documentLabelFor(advice.paymentMode as PaymentMode, advice.isAdvance),
      payeeName: advice.payeeName,
      amount: Number(advice.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 }),
      formDate: advice.formDate,
    },
    advice.submittedByEmail,
    id,
  );
  return { ok: true, data: { verifiedAt: now } };
}

/** Cash Voucher (and Cash-routed Advance) terminal "Mark Payment Done".
 * `bodyBillPassedFor` is the optional number a caller passed; the stored
 * Bill Passed For (or, for an Advance, the saved payable amount) is used
 * otherwise, exactly as before. */
export async function markCashPaymentDone(id: string, paymentDoneBy: string, roles: AdminRole[], bodyBillPassedFor: unknown, ctx: StageActionContext): Promise<StageActionResult<{ paymentDoneAt: Date }>> {
  const [advice] = await db
    .select({
      status: paymentAdvices.status,
      serialNo: paymentAdvices.serialNo,
      cashVoucherNo: paymentAdvices.cashVoucherNo,
      isAdvance: paymentAdvices.isAdvance,
      advanceNo: paymentAdvices.advanceNo,
      submittedByName: paymentAdvices.submittedByName,
      submittedByEmail: paymentAdvices.submittedByEmail,
      payeeName: paymentAdvices.payeeName,
      amount: paymentAdvices.amount,
      formDate: paymentAdvices.formDate,
      paymentMode: paymentAdvices.paymentMode,
      billPassedFor: paymentAdvices.billPassedFor,
      payableAmount: paymentAdvices.payableAmount,
      verifiedAt: paymentAdvices.verifiedAt,
      paymentDoneAt: paymentAdvices.paymentDoneAt,
    })
    .from(paymentAdvices)
    .where(eq(paymentAdvices.id, id))
    .limit(1);
  if (!advice) return fail(404, "Not found");
  if (!ownsSubmissionType(roles, advice.paymentMode as "NEFT" | "CASH")) return fail(403, paymentRoleError(advice.paymentMode));
  if (!advice.verifiedAt) return fail(409, "Must be verified before Payment Done.");
  if (advice.paymentDoneAt || advice.status === "APPROVED") return fail(409, "Already marked Payment Done.");

  const billPassedForInput = advice.isAdvance
    ? advice.payableAmount ? Number(advice.payableAmount) : undefined
    : typeof bodyBillPassedFor === "number"
      ? bodyBillPassedFor
      : advice.billPassedFor ? Number(advice.billPassedFor) : undefined;
  if (billPassedForInput === undefined) {
    return fail(400, advice.isAdvance
      ? "Save the Arrears/TDS payable calculation before marking Payment Done."
      : `${billPassedForLabelFor(false)} must be filled before marking Payment Done.`);
  }
  const amountCheck = billPassedForSchema(Number(advice.amount)).safeParse(billPassedForInput);
  if (!amountCheck.success) return fail(400, amountCheck.error.issues[0]?.message ?? "Invalid amount");

  const now = new Date();
  const done = await db.transaction(async (tx) => {
    const updated = await tx
      .update(paymentAdvices)
      .set({
        paymentDoneAt: now,
        paymentDoneBy,
        ...(!advice.isAdvance ? { billPassedFor: amountCheck.data.toFixed(2) } : {}),
        status: "APPROVED",
        approvedAt: now,
        approvedByName: paymentDoneBy,
        updatedAt: now,
      })
      .where(and(eq(paymentAdvices.id, id), isNull(paymentAdvices.paymentDoneAt), ne(paymentAdvices.status, "APPROVED")))
      .returning({ id: paymentAdvices.id });
    if (updated.length === 0) return false;
    await tx.insert(auditLog).values({
      paymentAdviceId: id,
      action: "PAYMENT_DONE",
      actor: paymentDoneBy,
      ipAddress: ctx.ip,
      details: advice.isAdvance
        ? { paymentDoneBy, payableAmount: amountCheck.data, ...ctx.extra }
        : { paymentDoneBy, billPassedFor: amountCheck.data, ...ctx.extra },
    });
    return true;
  });
  if (!done) return fail(409, "Already marked Payment Done.");

  await notifyPaymentDone(
    {
      displayNo: displayNoFor(advice.paymentMode as PaymentMode, advice.serialNo, advice.cashVoucherNo, advice.isAdvance, advice.advanceNo),
      submittedByName: advice.submittedByName,
      documentLabel: documentLabelFor(advice.paymentMode as PaymentMode, advice.isAdvance),
      payeeName: advice.payeeName,
      amount: Number(advice.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 }),
      formDate: advice.formDate,
    },
    advice.submittedByEmail,
    id,
  );
  return { ok: true, data: { paymentDoneAt: now } };
}

export type NeftPaymentData = { totalPaid: string; remaining: string; payableAmount: string; isFinal: boolean; paidAt: Date };

/** NEFT "Record a Payment": one payment_entries row, capped at the remaining
 * balance inside a SELECT ... FOR UPDATE transaction; the entry that reaches
 * the payable amount settles the advice. `expectedTotalPaid` (bulk only) is
 * the total paid the Finance user saw; if another payment was recorded in
 * the meantime the entry is refused rather than recorded on top of it. */
export async function recordNeftPayment(
  id: string,
  paidBy: string,
  roles: AdminRole[],
  body: unknown,
  ctx: StageActionContext & { expectedTotalPaid?: string },
): Promise<StageActionResult<NeftPaymentData>> {
  const [advice] = await db
    .select({
      paymentMode: paymentAdvices.paymentMode,
      serialNo: paymentAdvices.serialNo,
      cashVoucherNo: paymentAdvices.cashVoucherNo,
      isAdvance: paymentAdvices.isAdvance,
      advanceNo: paymentAdvices.advanceNo,
      submittedByName: paymentAdvices.submittedByName,
      submittedByEmail: paymentAdvices.submittedByEmail,
      payeeName: paymentAdvices.payeeName,
      formDate: paymentAdvices.formDate,
      verifiedAt: paymentAdvices.verifiedAt,
    })
    .from(paymentAdvices)
    .where(eq(paymentAdvices.id, id))
    .limit(1);
  if (!advice) return fail(404, "Not found");
  if (advice.paymentMode !== "NEFT") return fail(409, "Record a Payment is only available for NEFT Payment Advices.");
  if (!ownsSubmissionType(roles, "NEFT")) return fail(403, paymentRoleError("NEFT"));
  if (!advice.verifiedAt) return fail(409, "Must be verified before recording a payment.");

  const parsed = paymentEntrySchema.safeParse(body);
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Invalid data");

  const now = new Date();
  const amountPaise = Math.round(parsed.data.amount * 100);
  const remarks = parsed.data.remarks ?? "";

  const result: StageActionResult<NeftPaymentData> = await db.transaction(async (tx) => {
    const rows = await tx.execute<{ payable_amount: string | null; total_paid: string; status: string }>(sql`
      select payable_amount, total_paid, status
      from payment_advices
      where id = ${id}
      for update
    `);
    const row = rows.rows[0];
    if (!row) return fail(404, "Not found");
    if (row.status === "APPROVED") return fail(409, "This advice is already fully settled.");
    if (row.status !== "SUBMITTED") return fail(409, "Payments can only be recorded against an active submission.");
    if (!row.payable_amount) return fail(400, "Save the Arrears/TDS payable calculation before recording a payment.");

    const payableAmountPaise = Math.round(Number(row.payable_amount) * 100);
    const totalPaidPaise = Math.round(Number(row.total_paid) * 100);
    if (ctx.expectedTotalPaid !== undefined && Math.round(Number(ctx.expectedTotalPaid) * 100) !== totalPaidPaise) {
      return fail(409, "Another payment was recorded on this advice meanwhile. Reload and check the balance.");
    }
    const remainingPaise = payableAmountPaise - totalPaidPaise;
    if (amountPaise > remainingPaise) return fail(400, `Amount exceeds the remaining balance of ₹ ${money(remainingPaise / 100)}.`);

    const newTotalPaidPaise = totalPaidPaise + amountPaise;
    const newTotalPaid = (newTotalPaidPaise / 100).toFixed(2);
    const isFinal = newTotalPaidPaise >= payableAmountPaise;

    await tx.insert(paymentEntries).values({ paymentAdviceId: id, amount: parsed.data.amount.toFixed(2), remarks, paidAt: now, paidBy });
    await tx
      .update(paymentAdvices)
      .set({ totalPaid: newTotalPaid, updatedAt: now, ...(isFinal ? { status: "APPROVED" as const, approvedAt: now, approvedByName: paidBy } : {}) })
      .where(eq(paymentAdvices.id, id));
    await tx.insert(auditLog).values({
      paymentAdviceId: id,
      action: "PAYMENT_ENTRY_RECORDED",
      actor: paidBy,
      ipAddress: ctx.ip,
      details: { amount: parsed.data.amount, remarks, totalPaid: newTotalPaid, payableAmount: row.payable_amount, isFinal, ...ctx.extra },
    });
    return { ok: true as const, data: { totalPaid: newTotalPaid, remaining: ((payableAmountPaise - newTotalPaidPaise) / 100).toFixed(2), payableAmount: row.payable_amount, isFinal, paidAt: now } };
  });
  if (!result.ok) return result;

  await notifyPaymentEntry(
    {
      displayNo: displayNoFor("NEFT", advice.serialNo, advice.cashVoucherNo, advice.isAdvance, advice.advanceNo),
      submittedByName: advice.submittedByName,
      documentLabel: documentLabelFor("NEFT", advice.isAdvance),
      payeeName: advice.payeeName,
      entryAmount: money(parsed.data.amount),
      remarks,
      isFinal: result.data.isFinal,
      totalPaid: money(Number(result.data.totalPaid)),
      payableAmount: money(Number(result.data.payableAmount)),
      remaining: money(Number(result.data.remaining)),
      formDate: advice.formDate,
    },
    advice.submittedByEmail,
    id,
  );
  return result;
}
