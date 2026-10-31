import { and, eq, inArray, isNull, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { paymentAdvices } from "@/lib/db/schema";
import type { AdminSessionPayload } from "@/lib/auth";
import { buildTabCondition, type AdminTab } from "@/lib/admin/filters";
import { ownsSubmissionType } from "@/lib/admin/role-scope";
import { displayNoFor } from "@/lib/advice/document-identity";
import { pipelineStageFor } from "@/lib/advice/pipeline-stage";
import type { PaymentMode } from "@/lib/validation/payment-advice";
import { markCashPaymentDone, receiveAdvice, recordNeftPayment, verifyAdvice, type StageActionResult } from "@/lib/advice/finance-stage-actions";

/** Bulk Finance actions on the Submissions page. Every item goes through
 * the same function the single-item route uses (lib/advice/
 * finance-stage-actions.ts); this file only adds the batch rules:
 * - the item must be in the stage tab the action belongs to, else skipped;
 * - payment actions only on submission types the user owns (ALL both,
 *   PAYMENT_ADVICE NEFT, CASH_VOUCHER Cash), else skipped;
 * - payment rows are validated for the whole request first; any invalid row
 *   rejects the request and nothing is processed;
 * - one item failing never rolls back the others;
 * - at most 50 items per request, and the loop stops before Vercel's time
 *   limit, reporting the rest as not processed. */

export const BULK_MAX_ITEMS = 50;
export const BULK_ACTIONS = ["receive", "verify", "payment"] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];

/** Stage tabs each action applies to (the tab the item must be in now). */
export const BULK_ACTION_TABS: Record<BulkAction, AdminTab[]> = {
  receive: ["awaiting_finance", "advance_payment"],
  verify: ["received_in_process"],
  payment: ["verified_ready_payment"],
};

/** SQL twin of payableIsSet (lib/advice/payable-status.ts): Verified items
 * with no saved payable calculation (Cash Voucher: Bill passed for). Bulk
 * pays them on Basic with no deductions; drives the "Needs payable
 * calculation" filter and the count above the table. */
export function needsPayableCondition(): SQL {
  return or(
    and(eq(paymentAdvices.paymentMode, "NEFT"), isNull(paymentAdvices.payableAmount)),
    and(eq(paymentAdvices.paymentMode, "CASH"), eq(paymentAdvices.isAdvance, false), isNull(paymentAdvices.billPassedFor)),
    and(eq(paymentAdvices.paymentMode, "CASH"), eq(paymentAdvices.isAdvance, true), isNull(paymentAdvices.payableAmount)),
  )!;
}

export function bulkActionForTab(tab: AdminTab): BulkAction | null {
  for (const action of BULK_ACTIONS) if (BULK_ACTION_TABS[action].includes(tab)) return action;
  return null;
}

const itemSchema = z.object({
  id: z.string().uuid(),
  // payment only. NEFT: the amount paid now (partial allowed) and an
  // optional UTR / reference, stored as the payment entry's remarks.
  amount: z.number().optional(),
  reference: z.string().trim().max(200, "Keep the UTR or reference under 200 characters.").optional(),
  // NEFT payment only: the total already paid when the Finance user loaded
  // the row; a different value at save time means someone else recorded a
  // payment meanwhile, so the row is skipped, never paid twice.
  expectedTotalPaid: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
});

/** Nothing in here decides time, user or stage: those come from the server. */
export const bulkRequestSchema = z.object({
  action: z.enum(BULK_ACTIONS),
  items: z.array(itemSchema).min(1, "Select at least one submission.").max(BULK_MAX_ITEMS, `Select at most ${BULK_MAX_ITEMS} submissions at a time.`),
  batchId: z.string().uuid(),
  dryRun: z.boolean().optional().default(false),
}).refine((value) => new Set(value.items.map((item) => item.id)).size === value.items.length, { message: "The same submission is listed twice." });

export type BulkRequest = z.output<typeof bulkRequestSchema>;
export type BulkOutcome = "done" | "skipped" | "failed";
export type BulkItemResult = { id: string; reference: string; outcome: BulkOutcome; message: string };
export type BulkRowError = { id: string; reference: string; error: string };

type Loaded = {
  id: string; serialNo: string; cashVoucherNo: string | null; isAdvance: boolean; advanceNo: string | null; paymentMode: string;
  status: string; amount: string; basicAmount: string | null; payableAmount: string | null; billPassedFor: string | null; totalPaid: string;
  authorityApprovedAt: Date | null; financeReceivedAt: Date | null; verifiedAt: Date | null; paymentDoneAt: Date | null;
  sentBackAt: Date | null; rejectedAt: Date | null; updatedAt: Date;
};

const referenceOf = (row: Pick<Loaded, "paymentMode" | "serialNo" | "cashVoucherNo" | "isAdvance" | "advanceNo">) =>
  displayNoFor(row.paymentMode as PaymentMode, row.serialNo, row.cashVoucherNo, row.isAdvance, row.advanceNo);

/** Audit note when bulk pays a Cash Voucher that had no Bill passed for. */
export const BULK_CASH_VOUCHER_AMOUNT_NOTE = "bill passed for set to the voucher amount by bulk payment, no deductions";

/** NEFT payment row check, mirroring the single action's rules (positive,
 * at most 2 decimals, not above the remaining balance) (the UTR / reference
 * is optional, as in the single form). With no saved payable calculation
 * the cap is the Basic amount (an Advance: its amount): bulk pays it with
 * no deductions. Cash Vouchers without Bill passed for are paid on the
 * voucher amount, which the single Mark Payment Done action also accepts.
 * A Cash-routed Advance still needs its saved payable amount. */
export function validatePaymentRow(row: Loaded, item: BulkRequest["items"][number]): string | null {
  if (row.paymentMode === "NEFT") {
    const payable = row.payableAmount ?? (row.isAdvance ? row.amount : row.basicAmount);
    if (!payable || !(Number(payable) > 0)) return "Basic Amount is unavailable for this submission; contact Accounts before paying it.";
    if (typeof item.amount !== "number" || !Number.isFinite(item.amount) || item.amount <= 0) return "Enter an amount paid greater than 0.";
    if (Math.abs(item.amount * 100 - Math.round(item.amount * 100)) > 1e-6) return "The amount can have at most 2 decimal places.";
    const remainingPaise = Math.round(Number(payable) * 100) - Math.round(Number(row.totalPaid) * 100);
    const limit = row.payableAmount ? "the remaining" : "the Basic amount of";
    if (Math.round(item.amount * 100) > remainingPaise) return `The amount is more than ${limit} ₹ ${(remainingPaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}.`;
    if (item.expectedTotalPaid === undefined) return "Reload the page and try again.";
    return null;
  }
  if (row.isAdvance) return row.payableAmount ? null : "Save the Arrears/TDS payable calculation on this advice first.";
  return null;
}

async function loadItems(ids: string[]): Promise<{ rows: Map<string, Loaded>; inStage: (action: BulkAction) => Promise<Set<string>> }> {
  const loaded = await db.select({
    id: paymentAdvices.id, serialNo: paymentAdvices.serialNo, cashVoucherNo: paymentAdvices.cashVoucherNo, isAdvance: paymentAdvices.isAdvance,
    advanceNo: paymentAdvices.advanceNo, paymentMode: paymentAdvices.paymentMode, status: paymentAdvices.status, amount: paymentAdvices.amount, basicAmount: paymentAdvices.basicAmount,
    payableAmount: paymentAdvices.payableAmount, billPassedFor: paymentAdvices.billPassedFor, totalPaid: paymentAdvices.totalPaid,
    authorityApprovedAt: paymentAdvices.authorityApprovedAt, financeReceivedAt: paymentAdvices.financeReceivedAt, verifiedAt: paymentAdvices.verifiedAt,
    paymentDoneAt: paymentAdvices.paymentDoneAt, sentBackAt: paymentAdvices.sentBackAt, rejectedAt: paymentAdvices.rejectedAt, updatedAt: paymentAdvices.updatedAt,
  }).from(paymentAdvices).where(inArray(paymentAdvices.id, ids));
  const rows = new Map(loaded.map((row) => [row.id, row as Loaded]));
  const inStage = async (action: BulkAction) => {
    const conditions = BULK_ACTION_TABS[action].map((tab) => buildTabCondition(tab)!);
    const eligible = await db.select({ id: paymentAdvices.id }).from(paymentAdvices)
      .where(and(inArray(paymentAdvices.id, ids), conditions.length === 1 ? conditions[0] : or(...conditions)));
    return new Set(eligible.map((row) => row.id));
  };
  return { rows, inStage };
}

const STAGE_NAME: Record<BulkAction, string> = { receive: "Awaiting Finance Review", verify: "Received & In Process", payment: "Verified, Ready for Payment" };

function currentStage(row: Loaded): string {
  return pipelineStageFor({
    status: row.status, approvedAt: row.authorityApprovedAt, financeReceivedAt: row.financeReceivedAt, verifiedAt: row.verifiedAt,
    paymentDoneAt: row.paymentDoneAt, paymentMode: row.paymentMode, totalPaid: row.totalPaid, isAdvance: row.isAdvance,
  });
}

export type BulkResponse =
  | { kind: "invalid"; errors: BulkRowError[] }
  | { kind: "checked"; skipped: BulkItemResult[] }
  | { kind: "processed"; results: BulkItemResult[] };

/** Runs one bulk request. `deadlineMs` keeps the loop inside the function's
 * time limit; items not reached are reported as not processed. */
export async function runBulkFinanceAction(
  session: Pick<AdminSessionPayload, "roles" | "fullName">,
  request: BulkRequest,
  ip: string | null,
  options: { deadlineMs?: number } = {},
): Promise<BulkResponse> {
  const ids = request.items.map((item) => item.id);
  const { rows, inStage } = await loadItems(ids);
  const eligible = await inStage(request.action);

  const skipped: BulkItemResult[] = [];
  const runnable: BulkRequest["items"] = [];
  for (const item of request.items) {
    const row = rows.get(item.id);
    if (!row) { skipped.push({ id: item.id, reference: item.id, outcome: "skipped", message: "Not found." }); continue; }
    const reference = referenceOf(row);
    if (!eligible.has(item.id)) {
      skipped.push({ id: item.id, reference, outcome: "skipped", message: `No longer in ${STAGE_NAME[request.action]} (now: ${currentStage(row)}).` });
      continue;
    }
    if (request.action === "payment" && !ownsSubmissionType(session.roles, row.paymentMode as "NEFT" | "CASH")) {
      skipped.push({ id: item.id, reference, outcome: "skipped", message: `Your role cannot record payments for ${row.paymentMode === "NEFT" ? "Payment Advices" : "Cash Vouchers"}.` });
      continue;
    }
    runnable.push(item);
  }

  if (request.action === "payment") {
    const errors: BulkRowError[] = [];
    for (const item of runnable) {
      const row = rows.get(item.id)!;
      const error = validatePaymentRow(row, item);
      if (error) errors.push({ id: item.id, reference: referenceOf(row), error });
    }
    if (errors.length) return { kind: "invalid", errors };
  }
  if (request.dryRun) return { kind: "checked", skipped };

  const extra = { bulk: true, batchId: request.batchId, bulkBy: session.fullName };
  const deadline = options.deadlineMs ?? Date.now() + 45_000;
  const results: BulkItemResult[] = [...skipped];
  for (const item of runnable) {
    const row = rows.get(item.id)!;
    const reference = referenceOf(row);
    if (Date.now() > deadline) {
      results.push({ id: item.id, reference, outcome: "failed", message: "Not processed: time limit reached. Run it again." });
      continue;
    }
    let result: StageActionResult<unknown>;
    try {
      result = request.action === "receive" ? await receiveAdvice(item.id, session.fullName, { ip, extra })
        : request.action === "verify" ? await verifyAdvice(item.id, session.fullName, { ip, extra })
          : row.paymentMode === "NEFT"
            // Basic payment only: GST is never touched here (it is settled
            // separately per item). UTR goes into remarks only when given.
            // No saved payable calculation: paid on Basic, no deductions.
            ? await recordNeftPayment(item.id, session.fullName, session.roles, { amount: item.amount, ...(item.reference ? { remarks: `UTR / Ref: ${item.reference}` } : {}) }, { ip, extra, expectedTotalPaid: item.expectedTotalPaid, payableFromBasicIfUnset: true })
            : !row.isAdvance && !row.billPassedFor
              ? await markCashPaymentDone(item.id, session.fullName, session.roles, Number(row.amount), { ip, extra: { ...extra, note: BULK_CASH_VOUCHER_AMOUNT_NOTE } })
              : await markCashPaymentDone(item.id, session.fullName, session.roles, undefined, { ip, extra });
    } catch (error) {
      console.error("[Bulk] item failed", item.id, error instanceof Error ? error.message : error);
      results.push({ id: item.id, reference, outcome: "failed", message: "Unexpected error. Nothing was changed for this item." });
      continue;
    }
    if (result.ok) {
      const data = result.data as { isFinal?: boolean };
      const message = request.action === "receive" ? "Marked Received & In Process."
        : request.action === "verify" ? "Verified. Submitter emailed."
          : row.paymentMode === "NEFT" ? (data.isFinal ? "Payment recorded. Fully settled. Submitter emailed." : "Partial payment recorded. Submitter emailed.")
            : "Payment Done. Submitter emailed.";
      results.push({ id: item.id, reference, outcome: "done", message });
    } else {
      results.push({ id: item.id, reference, outcome: result.status === 409 || result.status === 404 ? "skipped" : "failed", message: result.error });
    }
  }
  return { kind: "processed", results };
}
