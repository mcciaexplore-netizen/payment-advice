import Link from "next/link";
import { db } from "@/lib/db";
import { refundRequests } from "@/lib/db/schema";
import { formatDateOnly } from "@/lib/date-time";
import { BRANCH_OPTIONS } from "@/lib/validation/payment-advice";
import { AttachmentPreview } from "@/components/ui/AttachmentPreview";
import { REFUND_DOCUMENT_LABELS, REFUND_LIST_ORDER, buildRefundWhere, parseRefundFilterParams } from "@/lib/advice/refund-query";

export const dynamic = "force-dynamic";

function formatAmount(value: string): string {
  return `₹ ${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

function toSearchParams(record: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) if (typeof value === "string" && value) params.set(key, value);
  return params;
}

/** Every Refund request, newest first, for Finance (the /admin prefix is
 * Finance-only in proxy.ts). Branch and date filters follow the Cash
 * Receipts list. Documents open through /api/admin/refund/[id]/documents/[n],
 * never a raw Blob URL; the printable request is the existing PDF route. */
export default async function RefundRequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = parseRefundFilterParams(toSearchParams(await searchParams));
  const rows = await db.select({
    id: refundRequests.id,
    serialNo: refundRequests.serialNo,
    requestDate: refundRequests.requestDate,
    branch: refundRequests.branch,
    submittedByName: refundRequests.submittedByName,
    submittedByEmail: refundRequests.submittedByEmail,
    submittedByDepartment: refundRequests.submittedByDepartment,
    recommendingAuthority: refundRequests.recommendingAuthority,
    payeeName: refundRequests.payeeName,
    natureOfExpenditure: refundRequests.natureOfExpenditure,
    totalAmount: refundRequests.totalAmount,
    documents: refundRequests.documents,
  }).from(refundRequests).where(buildRefundWhere(params)).orderBy(REFUND_LIST_ORDER);
  const total = rows.reduce((sum, row) => sum + Math.round(Number(row.totalAmount) * 100), 0) / 100;
  const filtered = Boolean(params.branch || params.dateFrom || params.dateTo);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-heading text-3xl text-[#0b1f3a]">Refund Requests</h1>
        <p className="mt-1 text-sm text-gray-600">{rows.length} request{rows.length === 1 ? "" : "s"}{filtered ? " matching the filters" : ""}, total {formatAmount(total.toFixed(2))}. Newest first.</p>
      </header>

      <form method="GET" action="/admin/refunds" className="flex flex-wrap items-end gap-3 rounded-md border border-gray-200 bg-gray-50 p-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="refund-branch" className="text-xs font-medium text-gray-600">Branch</label>
          <select id="refund-branch" name="branch" defaultValue={params.branch ?? ""} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm">
            <option value="">All branches</option>
            {BRANCH_OPTIONS.map((branch) => <option key={branch} value={branch}>{branch}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="refund-date-from" className="text-xs font-medium text-gray-600">From</label>
          <input id="refund-date-from" type="date" name="dateFrom" defaultValue={params.dateFrom ?? ""} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="refund-date-to" className="text-xs font-medium text-gray-600">To</label>
          <input id="refund-date-to" type="date" name="dateTo" defaultValue={params.dateTo ?? ""} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
        </div>
        <button type="submit" className="rounded-md bg-[#0b1f3a] px-4 py-1.5 text-sm font-medium text-white">Filter</button>
        {filtered ? <Link href="/admin/refunds" className="text-sm text-gray-600 underline">Clear</Link> : null}
      </form>

      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Payee / Nature</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Submitted By</th>
              <th className="px-4 py-3">Documents</th>
              <th className="px-4 py-3">Request</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No Refund requests found.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.id} className="border-b border-gray-100 align-top last:border-0 hover:bg-gray-50">
                <td className="whitespace-nowrap px-4 py-3"><div className="font-medium text-[#0b1f3a]">{row.serialNo}</div><div className="text-xs text-gray-500">{row.branch}</div></td>
                <td className="px-4 py-3"><div className="font-medium">{row.payeeName}</div><div className="mt-1 max-w-xs text-xs text-gray-600">{row.natureOfExpenditure}</div></td>
                <td className="whitespace-nowrap px-4 py-3 text-right">{formatAmount(row.totalAmount)}</td>
                <td className="whitespace-nowrap px-4 py-3">{formatDateOnly(row.requestDate)}</td>
                <td className="px-4 py-3"><div>{row.submittedByName}</div><div className="text-xs text-gray-500">{row.submittedByEmail}</div><div className="text-xs text-gray-500">{row.submittedByDepartment}. Recommending: {row.recommendingAuthority}</div></td>
                <td className="px-4 py-3">
                  {row.documents.length === 0 ? <span className="text-xs text-gray-400">None</span> : (
                    <ul className="flex flex-col gap-1">
                      {row.documents.map((document, index) => {
                        const href = `/api/admin/refund/${row.id}/documents/${index}`;
                        return (
                          <li key={`${row.id}-${index}`} className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="text-gray-500">{REFUND_DOCUMENT_LABELS[document.type] ?? document.type}:</span>
                            <AttachmentPreview fileName={document.fileName} href={href} className="max-w-[12rem] truncate font-medium text-[#0b1f3a] hover:underline">{document.fileName}</AttachmentPreview>
                            <a href={`${href}?download=1`} download={document.fileName} className="text-gray-600 underline">Download</a>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <div className="flex items-center gap-2">
                    <a href={`/api/refund/${row.id}/pdf`} target="_blank" rel="noreferrer" className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">View</a>
                    <a href={`/api/refund/${row.id}/pdf?download=1`} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">Download</a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
