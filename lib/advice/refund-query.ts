import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { refundRequests } from "@/lib/db/schema";
import { BRANCH_OPTIONS } from "@/lib/validation/payment-advice";

export type RefundFilterParams = { branch?: string; dateFrom?: string; dateTo?: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Same dateFrom / dateTo / branch convention as the Cash Receipts list.
 * Unknown branches and malformed dates are ignored rather than queried. */
export function parseRefundFilterParams(searchParams: URLSearchParams): RefundFilterParams {
  const branch = searchParams.get("branch") || undefined;
  const dateFrom = searchParams.get("dateFrom") || undefined;
  const dateTo = searchParams.get("dateTo") || undefined;
  return {
    branch: branch && (BRANCH_OPTIONS as readonly string[]).includes(branch) ? branch : undefined,
    dateFrom: dateFrom && ISO_DATE.test(dateFrom) ? dateFrom : undefined,
    dateTo: dateTo && ISO_DATE.test(dateTo) ? dateTo : undefined,
  };
}

export function buildRefundWhere(params: RefundFilterParams): SQL | undefined {
  const conditions: SQL[] = [];
  if (params.branch) conditions.push(eq(refundRequests.branch, params.branch));
  if (params.dateFrom) conditions.push(gte(refundRequests.requestDate, params.dateFrom));
  if (params.dateTo) conditions.push(lte(refundRequests.requestDate, params.dateTo));
  return conditions.length ? and(...conditions) : undefined;
}

export const REFUND_LIST_ORDER = desc(refundRequests.createdAt);

export const REFUND_DOCUMENT_LABELS: Record<string, string> = { EMAIL_COPY: "Email copy", CANCELLED_CHEQUE: "Cancelled cheque", OTHER: "Other" };
