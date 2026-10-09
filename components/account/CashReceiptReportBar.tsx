"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputClass = "rounded-md border border-gray-300 px-2 py-1.5 text-sm";

/** Date range + "Download Report" bar for the daily Cash Receipts report.
 *
 * Linked mode (filterBasePath set, Team Dashboard): changing a date or
 * pressing Today / Yesterday reloads the page with ?dateFrom/&dateTo so the
 * table below always shows exactly the range the button downloads.
 * Standalone mode (branchOptions set, /admin/cash-receipts): a required
 * Branch selector, and the bar only drives the download.
 *
 * Who may download what is enforced by /api/cash-receipt/report, not here. */
export function CashReceiptReportBar({
  today,
  yesterday,
  from: initialFrom,
  to: initialTo,
  filterBasePath,
  filterParams,
  branchOptions,
}: {
  today: string;
  yesterday: string;
  from: string;
  to: string;
  filterBasePath?: string;
  filterParams?: Record<string, string>;
  branchOptions?: readonly string[];
}) {
  const router = useRouter();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [branch, setBranch] = useState("");
  const [depositDate, setDepositDate] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function applyRange(nextFrom: string, nextTo: string) {
    setFrom(nextFrom);
    setTo(nextTo);
    setMessage(null);
    if (!filterBasePath || !nextFrom || !nextTo) return;
    const params = new URLSearchParams({ ...filterParams, dateFrom: nextFrom, dateTo: nextTo });
    router.push(`${filterBasePath}?${params.toString()}`);
  }

  async function download() {
    setMessage(null);
    if (branchOptions && !branch) {
      setMessage("Select a branch first.");
      return;
    }
    if (!from || !to) {
      setMessage("Enter both From and To dates.");
      return;
    }
    const params = new URLSearchParams({ dateFrom: from, dateTo: to });
    if (depositDate) params.set("depositDate", depositDate);
    if (branchOptions) params.set("branch", branch);
    setBusy(true);
    try {
      const response = await fetch(`/api/cash-receipt/report?${params.toString()}`);
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        setMessage(body?.error ?? "Could not download the report.");
        return;
      }
      const filename = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ?? "CashReceipts.xlsx";
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setMessage("Could not download the report.");
    } finally {
      setBusy(false);
    }
  }

  const quickClass = (active: boolean) => `rounded-md border px-3 py-1.5 text-sm font-medium ${active ? "border-[#0b1f3a] bg-[#0b1f3a] text-white" : "border-gray-300 text-gray-700 hover:bg-white"}`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3 rounded-md border border-gray-200 bg-gray-50 p-4">
        {branchOptions ? (
          <div className="flex flex-col gap-1">
            <label htmlFor="cash-report-branch" className="text-xs font-medium text-gray-600">Branch</label>
            <select id="cash-report-branch" required value={branch} onChange={(event) => { setBranch(event.target.value); setMessage(null); }} className={inputClass}>
              <option value="">Select branch</option>
              {branchOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
        ) : null}
        <div className="flex flex-col gap-1">
          <label htmlFor="cash-report-from" className="text-xs font-medium text-gray-600">From date</label>
          <input id="cash-report-from" type="date" value={from} max={to || undefined} onChange={(event) => applyRange(event.target.value, to)} className={inputClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="cash-report-to" className="text-xs font-medium text-gray-600">To date</label>
          <input id="cash-report-to" type="date" value={to} min={from || undefined} onChange={(event) => applyRange(from, event.target.value)} className={inputClass} />
        </div>
        <button type="button" onClick={() => applyRange(today, today)} className={quickClass(from === today && to === today)}>Today</button>
        <button type="button" onClick={() => applyRange(yesterday, yesterday)} className={quickClass(from === yesterday && to === yesterday)}>Yesterday</button>
        <div className="ml-auto flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="cash-report-deposit" className="text-xs font-medium text-gray-600">Deposit date (optional)</label>
            <input id="cash-report-deposit" type="date" value={depositDate} onChange={(event) => setDepositDate(event.target.value)} className={inputClass} />
          </div>
          <button type="button" onClick={download} disabled={busy} className="rounded-md bg-[#0b1f3a] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60">
            {busy ? "Preparing..." : "Download Report"}
          </button>
        </div>
      </div>
      {message ? <p role="status" className="text-sm text-red-700">{message}</p> : null}
    </div>
  );
}
