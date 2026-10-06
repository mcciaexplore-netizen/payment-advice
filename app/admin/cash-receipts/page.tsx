import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { cashReceipts } from "@/lib/db/schema";
import { formatDateOnly } from "@/lib/date-time";

export const dynamic = "force-dynamic";

function formatAmount(value: string): string {
  return `₹ ${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

export default async function CashReceiptsPage() {
  const rows = await db
    .select()
    .from(cashReceipts)
    .orderBy(desc(cashReceipts.createdAt));

  const total = rows.reduce((sum, row) => sum + Number(row.total), 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-3xl text-[#0b1f3a]">Cash Receipts</h1>
        <p className="mt-1 text-sm text-gray-600">
          {rows.length} receipt{rows.length === 1 ? "" : "s"} total, {formatAmount(total.toFixed(2))} combined.
        </p>
      </div>

      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full min-w-[840px] text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Branch</th>
              <th className="px-4 py-3">Party Name</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Receipt Date</th>
              <th className="px-4 py-3">Submitted By</th>
              <th className="px-4 py-3">PDF</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  No Cash Receipts submitted yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-[#0b1f3a]">{row.serialNo}</td>
                  <td className="whitespace-nowrap px-4 py-3">{row.branch}</td>
                  <td className="px-4 py-3">{row.partyName}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">{formatAmount(row.total)}</td>
                  <td className="whitespace-nowrap px-4 py-3">{formatDateOnly(row.receiptDate)}</td>
                  <td className="px-4 py-3">{row.submittedByName}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <a
                      href={`/cash-receipt/${row.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      View PDF
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
