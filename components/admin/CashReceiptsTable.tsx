"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateOnly } from "@/lib/date-time";
import { cashReceiptStatusText } from "@/lib/cash-receipts/status";

export type CashReceiptTableRow = {
  id: string;
  serialNo: string;
  branch: string;
  partyName: string;
  total: string;
  receiptDate: string;
  submittedByName: string;
  receivedAt: string | null;
  receivedBy: string | null;
  receivedNote: string | null;
  receivedEmailSentAt: string | null;
};

type Dialog = { kind: "mark"; ids: string[] } | { kind: "undo"; id: string } | null;

const rupees = (value: number) => `₹ ${value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
const smallButton = "rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50";

/** Finance's Cash Receipts table with "Cash received" marking. Selecting
 * and every action are offered only when `canMark` (ALL / CASH_VOUCHER) and
 * Undo only when `canUndo` (ALL); the API routes check the same rules, so
 * hiding a button is never the only guard. `interactive` is false for the
 * compact list on the Finance dashboard: status only, no actions. */
export function CashReceiptsTable({ rows, canMark, canUndo, interactive }: { rows: CashReceiptTableRow[]; canMark: boolean; canUndo: boolean; interactive: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<Dialog>(null);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const actions = interactive && canMark;
  const pending = useMemo(() => rows.filter((row) => !row.receivedAt), [rows]);
  const byId = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const allPendingSelected = pending.length > 0 && pending.every((row) => selected.has(row.id));

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function post(url: string, body: unknown) {
    setBusy(true);
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => null);
      return { ok: response.ok, payload };
    } finally {
      setBusy(false);
    }
  }

  async function confirmMark(ids: string[]) {
    const { ok, payload } = await post("/api/admin/cash-receipts/received", { ids, note });
    if (!ok) {
      setMessage({ tone: "error", text: payload?.error ?? "Could not mark as received." });
      return;
    }
    const marked = (payload.marked ?? []) as Array<{ serialNo: string; email: string }>;
    const notEmailed = marked.filter((item) => item.email !== "sent").map((item) => item.serialNo);
    const parts = [`Marked ${marked.length} receipt${marked.length === 1 ? "" : "s"} as received.`];
    if (payload.alreadyReceived?.length) parts.push(`Already received: ${payload.alreadyReceived.join(", ")}.`);
    if (notEmailed.length) parts.push(`Email not sent for ${notEmailed.join(", ")}. Use Resend email.`);
    setMessage({ tone: notEmailed.length ? "error" : "ok", text: parts.join(" ") });
    setDialog(null);
    setNote("");
    setSelected(new Set());
    router.refresh();
  }

  async function resend(row: CashReceiptTableRow) {
    const { ok, payload } = await post(`/api/admin/cash-receipts/${row.id}/received/resend-email`, {});
    setMessage(ok ? { tone: "ok", text: `Email sent for ${row.serialNo}.` } : { tone: "error", text: payload?.error ?? "Could not send the email." });
    router.refresh();
  }

  async function confirmUndo(id: string) {
    const { ok, payload } = await post(`/api/admin/cash-receipts/${id}/received/undo`, { reason });
    if (!ok) {
      setMessage({ tone: "error", text: payload?.error ?? "Could not undo." });
      return;
    }
    setMessage({ tone: "ok", text: `${payload.serialNo} is pending again.` });
    setDialog(null);
    setReason("");
    router.refresh();
  }

  const dialogRows = dialog?.kind === "mark" ? dialog.ids.map((id) => byId.get(id)!).filter(Boolean) : [];
  const dialogTotal = dialogRows.reduce((sum, row) => sum + Math.round(Number(row.total) * 100), 0) / 100;
  const selectedRows = [...selected].map((id) => byId.get(id)).filter((row): row is CashReceiptTableRow => Boolean(row));
  const selectedTotal = selectedRows.reduce((sum, row) => sum + Math.round(Number(row.total) * 100), 0) / 100;

  return (
    <div className="flex flex-col gap-3">
      {message ? <p role="status" className={`rounded-md border px-3 py-2 text-sm ${message.tone === "ok" ? "border-green-200 bg-green-50 text-green-800" : "border-amber-300 bg-amber-50 text-amber-900"}`}>{message.text}</p> : null}

      {actions && selected.size > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#0b1f3a]/20 bg-[#0b1f3a]/5 px-4 py-3">
          <p className="text-sm text-[#0b1f3a]"><strong>{selected.size}</strong> selected, {rupees(selectedTotal)}</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setSelected(new Set())} className={smallButton}>Clear</button>
            <button type="button" onClick={() => setDialog({ kind: "mark", ids: [...selected] })} className="rounded-md bg-[#0b1f3a] px-4 py-1.5 text-sm font-medium text-white">Mark selected as received</button>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              {actions ? <th className="w-10 px-4 py-3"><input type="checkbox" aria-label="Select all pending receipts" checked={allPendingSelected} disabled={pending.length === 0} onChange={() => setSelected(allPendingSelected ? new Set() : new Set(pending.map((row) => row.id)))} /></th> : null}
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Branch</th>
              <th className="px-4 py-3">Party Name</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Receipt Date</th>
              <th className="px-4 py-3">Issued By</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Documents</th>
              {actions ? <th className="px-4 py-3">Action</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={actions ? 10 : 8} className="px-4 py-8 text-center text-gray-500">No Cash Receipts found.</td></tr>
            ) : rows.map((row) => {
              const emailMissing = Boolean(row.receivedAt && !row.receivedEmailSentAt);
              return (
                <tr key={row.id} className={`border-b border-gray-100 align-top last:border-0 ${selected.has(row.id) ? "bg-[#0b1f3a]/5" : "hover:bg-gray-50"}`}>
                  {actions ? <td className="px-4 py-3">{row.receivedAt ? null : <input type="checkbox" aria-label={`Select ${row.serialNo}`} checked={selected.has(row.id)} onChange={() => toggle(row.id)} />}</td> : null}
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-[#0b1f3a]">{row.serialNo}</td>
                  <td className="whitespace-nowrap px-4 py-3">{row.branch}</td>
                  <td className="px-4 py-3">{row.partyName}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">{rupees(Number(row.total))}</td>
                  <td className="whitespace-nowrap px-4 py-3">{formatDateOnly(row.receiptDate)}</td>
                  <td className="px-4 py-3">{row.submittedByName}</td>
                  <td className="px-4 py-3">
                    {row.receivedAt
                      ? <span className="block max-w-[12rem] rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-800">{cashReceiptStatusText(row)}</span>
                      : <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">{cashReceiptStatusText(row)}</span>}
                    {row.receivedNote ? <div className="mt-1 max-w-[14rem] text-xs text-gray-600">Note: {row.receivedNote}</div> : null}
                    {emailMissing ? <div className="mt-1 text-xs font-medium text-amber-800">Email not sent</div> : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-2">
                      <a href={`/cash-receipt/${row.id}`} target="_blank" rel="noreferrer" className={smallButton}>View</a>
                      <a href={`/api/cash-receipt/${row.id}/pdf`} className={smallButton}>Download</a>
                    </div>
                  </td>
                  {actions ? (
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex flex-col items-start gap-1.5">
                        {!row.receivedAt ? <button type="button" disabled={busy} onClick={() => setDialog({ kind: "mark", ids: [row.id] })} className="rounded-md bg-[#2e8b57] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">Mark received</button> : null}
                        {emailMissing ? <button type="button" disabled={busy} onClick={() => resend(row)} className={smallButton}>Resend email</button> : null}
                        {row.receivedAt && canUndo ? <button type="button" disabled={busy} onClick={() => setDialog({ kind: "undo", id: row.id })} className="text-xs text-gray-500 underline">Undo</button> : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {dialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={dialog.kind === "mark" ? "Confirm cash received" : "Undo cash received"}>
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            {dialog.kind === "mark" ? (
              <>
                <h3 className="font-heading text-xl text-[#0b1f3a]">Confirm cash received</h3>
                <p className="mt-1 text-sm text-gray-600">Mark {dialogRows.length} receipt{dialogRows.length === 1 ? "" : "s"} as received. Each issuer gets one email.</p>
                <ul className="mt-3 max-h-48 overflow-y-auto rounded-md border border-gray-200 text-sm">
                  {dialogRows.map((row) => <li key={row.id} className="flex justify-between gap-3 border-b border-gray-100 px-3 py-1.5 last:border-0"><span className="font-medium text-[#0b1f3a]">{row.serialNo}</span><span>{rupees(Number(row.total))}</span></li>)}
                </ul>
                <p className="mt-2 flex justify-between text-sm font-semibold text-[#0b1f3a]"><span>Total</span><span>{rupees(dialogTotal)}</span></p>
                <label className="mt-4 block text-xs font-medium text-gray-600" htmlFor="received-note">Note (optional)</label>
                <input id="received-note" maxLength={200} value={note} onChange={(event) => setNote(event.target.value)} placeholder="For example: short by 50" className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" onClick={() => setDialog(null)} className={smallButton}>Cancel</button>
                  <button type="button" disabled={busy} onClick={() => confirmMark(dialog.ids)} className="rounded-md bg-[#2e8b57] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">{busy ? "Marking..." : "Confirm received"}</button>
                </div>
              </>
            ) : (
              <>
                <h3 className="font-heading text-xl text-[#0b1f3a]">Undo cash received</h3>
                <p className="mt-1 text-sm text-gray-600">{byId.get(dialog.id)?.serialNo} will show as Pending again. This is recorded in the audit log.</p>
                <label className="mt-4 block text-xs font-medium text-gray-600" htmlFor="undo-reason">Reason (required)</label>
                <textarea id="undo-reason" rows={3} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" onClick={() => setDialog(null)} className={smallButton}>Cancel</button>
                  <button type="button" disabled={busy || reason.trim().length < 3} onClick={() => confirmUndo(dialog.id)} className="rounded-md bg-red-700 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">Undo</button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
