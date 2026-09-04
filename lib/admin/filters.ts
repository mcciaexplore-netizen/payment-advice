import { and, asc, desc, eq, gt, gte, ilike, isNotNull, isNull, lte, or, sql, SQL } from "drizzle-orm";
import { paymentAdvices } from "@/lib/db/schema";
import { statusSchema, paymentModeSchema } from "@/lib/validation/payment-advice";

export type AdviceFilterParams = {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  payee?: string;
  department?: string;
  paymentMode?: string;
  q?: string;
};

/** Reads filter params out of a URLSearchParams-like object (used by both
 * the admin list page and the Excel export route, which must apply
 * identical filtering to the same result set). */
export function parseAdviceFilterParams(
  searchParams: URLSearchParams,
): AdviceFilterParams {
  return {
    status: searchParams.get("status") ?? undefined,
    dateFrom: searchParams.get("dateFrom") ?? undefined,
    dateTo: searchParams.get("dateTo") ?? undefined,
    payee: searchParams.get("payee") ?? undefined,
    department: searchParams.get("department") ?? undefined,
    paymentMode: searchParams.get("paymentMode") ?? undefined,
    q: searchParams.get("q") ?? undefined,
  };
}

/** Next.js server-component pages receive searchParams as a plain object
 * (not URLSearchParams) — this adapts it so both the page and the API route
 * can share one filter parser. */
export function searchParamsRecordToURLSearchParams(
  record: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined) continue;
    params.set(key, Array.isArray(value) ? (value[0] ?? "") : value);
  }
  return params;
}

export function buildAdviceWhere(params: AdviceFilterParams): SQL | undefined {
  const conditions: SQL[] = [];

  const status = statusSchema.safeParse(params.status);
  if (status.success) conditions.push(eq(paymentAdvices.status, status.data));

  if (params.dateFrom) conditions.push(gte(paymentAdvices.formDate, params.dateFrom));
  if (params.dateTo) conditions.push(lte(paymentAdvices.formDate, params.dateTo));
  if (params.payee) conditions.push(ilike(paymentAdvices.payeeName, `%${params.payee}%`));
  if (params.department) {
    conditions.push(ilike(paymentAdvices.submittedByDepartment, `%${params.department}%`));
  }

  const paymentMode = paymentModeSchema.safeParse(params.paymentMode);
  if (paymentMode.success) conditions.push(eq(paymentAdvices.paymentMode, paymentMode.data));

  if (params.q) {
    const term = `%${params.q}%`;
    const searchOr = or(
      ilike(paymentAdvices.serialNo, term),
      ilike(paymentAdvices.billNo, term),
      ilike(paymentAdvices.payeeName, term),
    );
    if (searchOr) conditions.push(searchOr);
  }

  return conditions.length ? and(...conditions) : undefined;
}

export const SORTABLE_COLUMNS = {
  serialNo: paymentAdvices.serialNo,
  formDate: paymentAdvices.formDate,
  payeeName: paymentAdvices.payeeName,
  amount: paymentAdvices.amount,
  paymentMode: paymentAdvices.paymentMode,
  submittedByName: paymentAdvices.submittedByName,
  submittedByDepartment: paymentAdvices.submittedByDepartment,
  status: paymentAdvices.status,
} as const;

export type SortColumn = keyof typeof SORTABLE_COLUMNS;

export function isSortColumn(value: string | null | undefined): value is SortColumn {
  return !!value && value in SORTABLE_COLUMNS;
}

export function buildOrderBy(sort?: string, dir?: string) {
  const column = isSortColumn(sort) ? SORTABLE_COLUMNS[sort] : paymentAdvices.createdAt;
  return dir === "asc" ? asc(column) : desc(column);
}

/** Sent Back is an operational follow-up queue, so its useful default is
 * oldest send-back first. Explicit user-selected column/direction sorting
 * still wins, exactly as it does in every other tab. */
export function buildAdminListOrderBy(tab: AdminTab, sort?: string, dir?: string) {
  const typeGroup = sql<number>`case
    when ${paymentAdvices.isAdvance} = true then 3
    when ${paymentAdvices.paymentMode} = 'CASH' then 2
    else 1
  end`;
  const displayedReference = sql<string>`case
    when ${paymentAdvices.isAdvance} = true then coalesce(${paymentAdvices.advanceNo}, ${paymentAdvices.serialNo})
    when ${paymentAdvices.paymentMode} = 'CASH' then coalesce(${paymentAdvices.cashVoucherNo}, ${paymentAdvices.serialNo})
    else ${paymentAdvices.serialNo}
  end`;
  const direction = dir === "asc" ? asc : desc;
  const withinGroup = sort === "serialNo"
    ? direction(displayedReference)
    : tab === "sent_back" && !isSortColumn(sort)
      ? asc(paymentAdvices.sentBackAt)
      : buildOrderBy(sort, dir);
  return [asc(typeGroup), withinGroup, desc(paymentAdvices.createdAt)] as const;
}

export const ADMIN_LIST_PAGE_SIZE = 25;

/**
 * Splits the queue by pipeline stage, layered on top of the existing
 * filters — not a replacement for them. The first four tabs all imply
 * status SUBMITTED (a SENT_BACK entry belongs in none of them, and once
 * Payment Done fires, status flips to APPROVED so it naturally falls out of
 * all four too); "payment_done" is the only one keyed on status APPROVED
 * instead. "sent_back" makes SENT_BACK entries proactively visible (they
 * were previously only reachable via "all" + a manual status filter — see
 * AGENT_HANDOFF.md's Task B audit). "all" imposes no extra condition,
 * matching the full unfiltered list this page showed before the Approval
 * Workflow.
 *
 * "verified_ready_payment" replaced "verified_awaiting_sanction" — Sanction
 * is retired as an active step (see AGENT_HANDOFF.md's "Real logins, retire
 * Sanction" session); "Ready for Payment" is not a new column, it's the
 * exact same derived condition the old tab used (verified_at set), just
 * renamed/relabeled since there's no more Sanction stage to be "awaiting."
 *
 * "advance_payment" is Advance Payment's own landing tab (see
 * AGENT_HANDOFF.md) — split out of "awaiting_finance" using the exact same
 * underlying condition (authority-approved, not yet Finance-received), just
 * also requiring `is_advance = true`; "awaiting_finance" is correspondingly
 * narrowed to `is_advance = false` so an approved advance lands in exactly
 * one of the two tabs, never both. This separation is deliberately only at
 * the landing point — once Finance marks an advance Received, it falls out
 * of "advance_payment" (financeReceivedAt is no longer null) and into the
 * same shared "received_in_process" / "verified_ready_payment" / payment
 * tabs every other submission uses, with no is_advance condition anywhere
 * past this one tab.
 *
 * NEFT's multi-part payment model (see AGENT_HANDOFF.md) replaced the old
 * single "payment_done" tab's NEFT half with two new ones,
 * "partial_payment_done" and "fully_payment_settled" — both keyed on
 * `payment_mode = 'NEFT'` so they never pick up Cash rows. "payment_done"
 * itself is now scoped to `payment_mode = 'CASH'` and its condition is
 * otherwise byte-for-byte unchanged — Cash's single "Mark Payment Done"
 * action still reaches it exactly as before. "verified_ready_payment" also
 * gained a `total_paid = 0` condition so a NEFT row with a partial payment
 * recorded (still `status = 'SUBMITTED'`, verified_at set, payment_done_at
 * still null since NEFT never touches that column) correctly falls out of
 * this tab into "partial_payment_done" instead — Cash rows always have
 * total_paid = 0 (Cash never inserts payment_entries), so this is a no-op
 * for them.
 */
export const ADMIN_TABS = [
  "waiting_authority",
  "awaiting_finance",
  "advance_payment",
  "received_in_process",
  "verified_ready_payment",
  "partial_payment_done",
  "fully_payment_settled",
  "payment_done",
  "sent_back",
  "all",
] as const;
export type AdminTab = (typeof ADMIN_TABS)[number];

export function isAdminTab(value: string | null | undefined): value is AdminTab {
  return !!value && (ADMIN_TABS as readonly string[]).includes(value);
}

export function buildTabCondition(tab: AdminTab): SQL | undefined {
  const submitted = eq(paymentAdvices.status, "SUBMITTED");
  if (tab === "waiting_authority") {
    return and(submitted, isNull(paymentAdvices.authorityApprovedAt));
  }
  if (tab === "awaiting_finance") {
    return and(
      submitted,
      isNotNull(paymentAdvices.authorityApprovedAt),
      isNull(paymentAdvices.financeReceivedAt),
      eq(paymentAdvices.isAdvance, false),
    );
  }
  if (tab === "advance_payment") {
    return and(
      submitted,
      isNotNull(paymentAdvices.authorityApprovedAt),
      isNull(paymentAdvices.financeReceivedAt),
      eq(paymentAdvices.isAdvance, true),
    );
  }
  if (tab === "received_in_process") {
    return and(submitted, isNotNull(paymentAdvices.financeReceivedAt), isNull(paymentAdvices.verifiedAt));
  }
  if (tab === "verified_ready_payment") {
    return and(
      submitted,
      isNotNull(paymentAdvices.verifiedAt),
      isNull(paymentAdvices.paymentDoneAt),
      eq(paymentAdvices.totalPaid, "0"),
    );
  }
  if (tab === "partial_payment_done") {
    return and(submitted, eq(paymentAdvices.paymentMode, "NEFT"), gt(paymentAdvices.totalPaid, "0"));
  }
  if (tab === "fully_payment_settled") {
    return and(eq(paymentAdvices.status, "APPROVED"), eq(paymentAdvices.paymentMode, "NEFT"));
  }
  if (tab === "payment_done") {
    return and(eq(paymentAdvices.status, "APPROVED"), eq(paymentAdvices.paymentMode, "CASH"));
  }
  if (tab === "sent_back") {
    return eq(paymentAdvices.status, "SENT_BACK");
  }
  return undefined;
}
