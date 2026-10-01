import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { forwardingMemos } from "@/lib/db/schema";
import { formatDateOnly, formatIstDate } from "@/lib/date-time";
import { MarkReceivedButton } from "@/components/admin/MarkReceivedButton";

export const dynamic = "force-dynamic";

function formatAmount(value: string): string {
  return `₹ ${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

export default async function ForwardingMemosPage() {
  const rows = await db
    .select()
    .from(forwardingMemos)
    .orderBy(desc(forwardingMemos.createdAt));

  const receivedCount = rows.filter((row) => row.receivedAt).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-3xl text-[#0b1f3a]">Forwarding Memos</h1>
        <p className="mt-1 text-sm text-gray-600">
          {rows.length} memo{rows.length === 1 ? "" : "s"} total - {receivedCount} received, {rows.length - receivedCount} not yet received.
        </p>
      </div>

      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Party Name</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Instrument</th>
              <th className="px-4 py-3">Memo Date</th>
              <th className="px-4 py-3">Submitted By</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  No Forwarding Memos submitted yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-[#0b1f3a]">{row.serialNo}</td>
                  <td className="px-4 py-3">{row.partyName}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">{formatAmount(row.amount)}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {row.instrumentMode === "CHEQUE" ? "Cheque" : "D.D."} {row.instrumentNo}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{formatDateOnly(row.memoDate)}</td>
                  <td className="px-4 py-3">{row.submittedByName}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {row.receivedAt ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="w-fit rounded-full bg-[#2e8b57]/10 px-2.5 py-1 text-xs font-medium text-[#1f6b41]">
                          Received
                        </span>
                        <span className="text-xs text-gray-500">
                          {row.receivedBy} · {formatIstDate(row.receivedAt)}
                        </span>
                      </div>
                    ) : (
                      <span className="w-fit rounded-full bg-[#e8a33d]/15 px-2.5 py-1 text-xs font-medium text-[#8a5a12]">
                        Not Received
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-2">
                      <a
                        href={`/api/forwarding-memo/${row.id}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        View PDF
                      </a>
                      {!row.receivedAt ? <MarkReceivedButton forwardingMemoId={row.id} /> : null}
                    </div>
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
