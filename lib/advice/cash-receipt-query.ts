import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { cashReceipts } from "@/lib/db/schema";

export type CashReceiptFilterParams = {
  branch?: string;
  dateFrom?: string;
  dateTo?: string;
};

/** Reads filter params out of a URLSearchParams-like object - same
 * dateFrom/dateTo naming convention lib/advice/filters.ts already
 * established for the main Submissions queue, so both pages read query
 * strings the same way. */
export function parseCashReceiptFilterParams(searchParams: URLSearchParams): CashReceiptFilterParams {
  return {
    branch: searchParams.get("branch") || undefined,
    dateFrom: searchParams.get("dateFrom") || undefined,
    dateTo: searchParams.get("dateTo") || undefined,
  };
}

export function buildCashReceiptWhere(params: CashReceiptFilterParams): SQL | undefined {
  const conditions: SQL[] = [];
  if (params.branch) conditions.push(eq(cashReceipts.branch, params.branch));
  if (params.dateFrom) conditions.push(gte(cashReceipts.receiptDate, params.dateFrom));
  if (params.dateTo) conditions.push(lte(cashReceipts.receiptDate, params.dateTo));
  return conditions.length ? and(...conditions) : undefined;
}

export const CASH_RECEIPT_LIST_ORDER = desc(cashReceipts.createdAt);
