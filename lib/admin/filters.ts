import { and, asc, desc, eq, gte, ilike, isNotNull, isNull, lte, or, SQL } from "drizzle-orm";
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

export const ADMIN_LIST_PAGE_SIZE = 25;

/**
 * Splits the queue by pipeline stage, layered on top of the existing
 * filters — not a replacement for them. The first four tabs all imply
 * status SUBMITTED (a SENT_BACK entry belongs in none of them, and once
 * sanctioned, status flips to APPROVED so it naturally falls out of all
 * four too); "sanctioned_ready" is the only one keyed on status APPROVED
 * instead. "sent_back" makes SENT_BACK entries proactively visible (they
 * were previously only reachable via "all" + a manual status filter — see
 * AGENT_HANDOFF.md's Task B audit). "all" imposes no extra condition,
 * matching the full unfiltered list this page showed before the Approval
 * Workflow.
 */
export const ADMIN_TABS = [
  "waiting_authority",
  "awaiting_finance",
  "received_in_process",
  "verified_awaiting_sanction",
  "sanctioned_ready",
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
    );
  }
  if (tab === "received_in_process") {
    return and(submitted, isNotNull(paymentAdvices.financeReceivedAt), isNull(paymentAdvices.verifiedAt));
  }
  if (tab === "verified_awaiting_sanction") {
    return and(submitted, isNotNull(paymentAdvices.verifiedAt), isNull(paymentAdvices.sanctionedAt));
  }
  if (tab === "sanctioned_ready") {
    return eq(paymentAdvices.status, "APPROVED");
  }
  if (tab === "sent_back") {
    return eq(paymentAdvices.status, "SENT_BACK");
  }
  return undefined;
}
