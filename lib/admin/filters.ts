import { and, asc, desc, eq, gte, ilike, lte, or, SQL } from "drizzle-orm";
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
