import Link from "next/link";
import { db } from "@/lib/db";
import { cashReceipts } from "@/lib/db/schema";
import { BRANCH_OPTIONS } from "@/lib/validation/payment-advice";
import { getAdminSession } from "@/lib/admin-session";
import { canMarkCashReceiptReceived, canUndoCashReceiptReceived } from "@/lib/cash-receipts/received";
import { CashReceiptsTable } from "@/components/admin/CashReceiptsTable";
import {
  CASH_RECEIPT_LIST_ORDER,
  buildCashReceiptWhere,
  parseCashReceiptFilterParams,
  type CashReceiptFilterParams,
} from "@/lib/advice/cash-receipt-query";

function toSearchParams(record: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string" && value) params.set(key, value);
  }
  return params;
}

/** The "Cash Receipts" section every Finance dashboard shows (see
 * AGENT_HANDOFF.md for which three) - branch + date filters, newest first,
 * serial/branch/party/amount/date/issued-by/View+Download. Also used,
 * unfiltered-by-default and capped, as the section embedded directly on
 * the main Finance Dashboard, so both call sites render from one real
 * query rather than two that could drift apart. */
export async function CashReceiptsSection({
  searchParams,
  baseHref,
  limit,
  viewAllHref,
}: {
  searchParams: Record<string, string | string[] | undefined>;
  baseHref: string;
  /** Caps the row count for a compact dashboard embed; omitted on the full
   * dedicated listing page. */
  limit?: number;
  /** Shown only when limit is set, linking to the full filterable page. */
  viewAllHref?: string;
}) {
  const params = parseCashReceiptFilterParams(toSearchParams(searchParams));
  const where = buildCashReceiptWhere(params);
  const query = db.select().from(cashReceipts).where(where).orderBy(CASH_RECEIPT_LIST_ORDER);
  const [rows, session] = await Promise.all([limit ? query.limit(limit) : query, getAdminSession()]);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-xl text-[#0b1f3a]">Cash Receipts</h2>
        {limit && viewAllHref ? (
          <Link href={viewAllHref} className="text-sm font-medium text-[#0b1f3a] underline hover:no-underline">
            View all
          </Link>
        ) : null}
      </div>

      {!limit ? (
        <form method="GET" action={baseHref} className="flex flex-wrap items-end gap-3 rounded-md border border-gray-200 bg-gray-50 p-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="cash-receipt-branch" className="text-xs font-medium text-gray-600">Branch</label>
            <select id="cash-receipt-branch" name="branch" defaultValue={params.branch ?? ""} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm">
              <option value="">All branches</option>
              {BRANCH_OPTIONS.map((branch) => <option key={branch} value={branch}>{branch}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="cash-receipt-date-from" className="text-xs font-medium text-gray-600">From</label>
            <input id="cash-receipt-date-from" type="date" name="dateFrom" defaultValue={params.dateFrom ?? ""} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="cash-receipt-date-to" className="text-xs font-medium text-gray-600">To</label>
            <input id="cash-receipt-date-to" type="date" name="dateTo" defaultValue={params.dateTo ?? ""} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
          </div>
          <button type="submit" className="rounded-md bg-[#0b1f3a] px-4 py-1.5 text-sm font-medium text-white">Filter</button>
          {params.branch || params.dateFrom || params.dateTo ? (
            <Link href={baseHref} className="text-sm text-gray-600 underline">Clear</Link>
          ) : null}
        </form>
      ) : null}

      <CashReceiptsTable
        rows={rows.map((row) => ({
          id: row.id,
          serialNo: row.serialNo,
          branch: row.branch,
          partyName: row.partyName,
          total: row.total,
          receiptDate: row.receiptDate,
          submittedByName: row.submittedByName,
          receivedAt: row.receivedAt?.toISOString() ?? null,
          receivedBy: row.receivedBy,
          receivedNote: row.receivedNote,
          receivedEmailSentAt: row.receivedEmailSentAt?.toISOString() ?? null,
        }))}
        canMark={canMarkCashReceiptReceived(session)}
        canUndo={canUndoCashReceiptReceived(session)}
        interactive={!limit}
      />
    </section>
  );
}

export type { CashReceiptFilterParams };
