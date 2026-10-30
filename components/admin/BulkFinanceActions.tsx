"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export type BulkAction = "receive" | "verify" | "payment";

export type BulkRow = {
  id: string;
  reference: string;
  payeeName: string;
  amount: string;
  paymentMode: "NEFT" | "CASH";
  isAdvance: boolean;
  payableAmount: string | null;
  billPassedFor: string | null;
  totalPaid: string;
  /** False when this user's role may not run the action on this row. */
  selectable: boolean;
};

type ItemResult = { id: string; reference: string; outcome: "done" | "skipped" | "failed"; message: string };
type RowError = { id: string; reference: string; error: string };
type PaymentInput = { amount: string; reference: string };

const CHUNK_SIZE = 5;
const MAX_ITEMS = 50;
const LABELS: Record<BulkAction, { button: string; title: string; done: string }> = {
  receive: { button: "Mark received", title: "Mark as Received & In Process", done: "received" },
  verify: { button: "Mark verified", title: "Mark as Verified", done: "verified" },
  payment: { button: "Mark payment done", title: "Record payments", done: "paid" },
};
const rupees = (value: number) => `₹ ${value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
const paise = (value: string | number) => Math.round(Number(value) * 100);
const smallButton = "rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50";

function remainingFor(row: BulkRow): number {
  return (paise(row.payableAmount ?? 0) - paise(row.totalPaid)) / 100;
}

/** What a Cash row will be paid, from saved data (same as the single Mark
 * Payment Done button): Bill Passed For, or the payable amount for an Advance. */
function cashAmountFor(row: BulkRow): string | null {
  return row.isAdvance ? row.payableAmount : row.billPassedFor;
}

type Ctx = { action: BulkAction; selected: Set<string>; toggle: (id: string) => void; setAll: (ids: string[]) => void; rows: BulkRow[] };
const BulkContext = createContext<Ctx | null>(null);

export function BulkRowCheckbox({ id }: { id: string }) {
  const ctx = useContext(BulkContext);
  const row = ctx?.rows.find((candidate) => candidate.id === id);
  if (!ctx || !row?.selectable) return null;
  return <input type="checkbox" aria-label={`Select ${row.reference}`} checked={ctx.selected.has(id)} onChange={() => ctx.toggle(id)} />;
}

export function BulkSelectAll() {
  const ctx = useContext(BulkContext);
  if (!ctx) return null;
  const selectable = ctx.rows.filter((row) => row.selectable).map((row) => row.id).slice(0, MAX_ITEMS);
  const all = selectable.length > 0 && selectable.every((id) => ctx.selected.has(id));
  return <input type="checkbox" aria-label="Select all on this page" disabled={selectable.length === 0} checked={all} onChange={() => ctx.setAll(all ? [] : selectable)} />;
}

/** Wraps the Submissions table on the Awaiting Finance Review / Advance
 * Payment (Mark received), Received & In Process (Mark verified) and
 * Verified, Ready for Payment (Mark payment done) tabs. The server
 * re-checks stage, role and every payment row; this component only
 * collects the selection and the per-row payment input. */
export function BulkFinanceProvider({ action, rows, children }: { action: BulkAction; rows: BulkRow[]; children: React.ReactNode }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [payments, setPayments] = useState<Record<string, PaymentInput>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ItemResult[] | null>(null);

  const byId = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const chosen = [...selected].map((id) => byId.get(id)).filter((row): row is BulkRow => Boolean(row));
  const total = chosen.reduce((sum, row) => sum + paise(row.amount), 0) / 100;
  const labels = LABELS[action];

  const ctx: Ctx = {
    action, rows, selected,
    toggle: (id) => setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_ITEMS) next.add(id);
      return next;
    }),
    setAll: (ids) => setSelected(new Set(ids)),
  };

  function openConfirm() {
    setError(null);
    setRowErrors({});
    setResults(null);
    if (action === "payment") {
      const initial: Record<string, PaymentInput> = {};
      for (const row of chosen) initial[row.id] = payments[row.id] ?? { amount: row.paymentMode === "NEFT" ? remainingFor(row).toFixed(2) : cashAmountFor(row) ?? "", reference: "" };
      setPayments(initial);
    }
    setOpen(true);
  }

  /** Browser-side copy of the server's row rules, for instant feedback. */
  function validateLocally(): Record<string, string> {
    const errors: Record<string, string> = {};
    for (const row of chosen) {
      if (row.paymentMode === "NEFT") {
        const input = payments[row.id];
        const amount = Number(input?.amount);
        if (!row.payableAmount) errors[row.id] = "Save the payable calculation on this advice first.";
        else if (!input?.amount || !Number.isFinite(amount) || amount <= 0) errors[row.id] = "Enter an amount greater than 0.";
        else if (!/^\d+(\.\d{1,2})?$/.test(input.amount.trim())) errors[row.id] = "At most 2 decimal places.";
        else if (paise(amount) > paise(remainingFor(row))) errors[row.id] = `More than the remaining ${rupees(remainingFor(row))}.`;
        else if (!input.reference.trim()) errors[row.id] = "Enter the UTR or reference.";
      } else if (!cashAmountFor(row)) {
        errors[row.id] = row.isAdvance ? "Save the payable calculation on this advice first." : "Save Bill passed for Rs. on this advice first.";
      }
    }
    return errors;
  }

  function itemsFor(list: BulkRow[]) {
    return list.map((row) => action === "payment" && row.paymentMode === "NEFT"
      ? { id: row.id, amount: Number(payments[row.id].amount), reference: payments[row.id].reference.trim(), expectedTotalPaid: Number(row.totalPaid).toFixed(2) }
      : { id: row.id });
  }

  async function call(body: unknown) {
    const response = await fetch("/api/admin/advice/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: response.ok, payload: await response.json().catch(() => null) };
  }

  async function confirm() {
    if (busy) return;
    setError(null);
    if (action === "payment") {
      const local = validateLocally();
      setRowErrors(local);
      if (Object.keys(local).length) return;
    }
    setBusy(true);
    const batchId = crypto.randomUUID();
    try {
      if (action === "payment") {
        // Whole batch checked on the server before anything is paid.
        const check = await call({ action, batchId, dryRun: true, items: itemsFor(chosen) });
        if (!check.ok) {
          setError(check.payload?.error ?? "Could not check the payments.");
          setRowErrors(Object.fromEntries(((check.payload?.errors ?? []) as RowError[]).map((rowError) => [rowError.id, rowError.error])));
          return;
        }
      }
      const collected: ItemResult[] = [];
      for (let start = 0; start < chosen.length; start += CHUNK_SIZE) {
        const chunk = chosen.slice(start, start + CHUNK_SIZE);
        setProgress(`Processing ${Math.min(start + chunk.length, chosen.length)} of ${chosen.length}...`);
        const { ok, payload } = await call({ action, batchId, items: itemsFor(chunk) });
        if (ok) collected.push(...(payload.results as ItemResult[]));
        else for (const row of chunk) collected.push({ id: row.id, reference: row.reference, outcome: "failed", message: payload?.error ?? "Request failed. Nothing was changed for this item." });
      }
      setResults(collected);
      setSelected(new Set());
    } catch {
      setError("Network error. Some items may have been processed; reload to see their current stage.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  function close() {
    setOpen(false);
    if (results) { setResults(null); router.refresh(); }
  }

  const emailNote = action === "receive" ? "No email is sent for Received & In Process (same as the single action)."
    : action === "verify" ? "Each submitter gets the usual Verified email, one per submission."
      : "Each submitter gets the usual email, one per submission: Payment Done for Cash, Payment recorded for NEFT.";
  const payTotal = action === "payment"
    ? chosen.reduce((sum, row) => sum + paise(row.paymentMode === "NEFT" ? payments[row.id]?.amount || 0 : cashAmountFor(row) ?? 0), 0) / 100
    : total;
  const counts = results ? { done: results.filter((r) => r.outcome === "done").length, skipped: results.filter((r) => r.outcome === "skipped").length, failed: results.filter((r) => r.outcome === "failed").length } : null;

  return (
    <BulkContext.Provider value={ctx}>
      {children}

      {selected.size > 0 && !open ? (
        <div className="sticky bottom-4 z-40 mx-auto flex w-fit flex-wrap items-center gap-4 rounded-lg border border-[#0b1f3a]/20 bg-white px-5 py-3 shadow-lg">
          <p className="text-sm text-[#0b1f3a]"><strong>{selected.size}</strong> selected, {rupees(total)}{selected.size >= MAX_ITEMS ? ` (limit ${MAX_ITEMS})` : ""}</p>
          <button type="button" onClick={() => setSelected(new Set())} className={smallButton}>Clear</button>
          <button type="button" onClick={openConfirm} className="rounded-md bg-[#0b1f3a] px-4 py-1.5 text-sm font-medium text-white">{labels.button}</button>
        </div>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={results ? "Bulk action results" : labels.title}>
          <div className={`max-h-[90vh] w-full overflow-y-auto rounded-lg bg-white p-6 shadow-xl ${action === "payment" && !results ? "max-w-5xl" : "max-w-2xl"}`}>
            {results && counts ? (
              <>
                <h3 className="font-heading text-xl text-[#0b1f3a]">Done</h3>
                <p className="mt-1 text-sm text-gray-700"><span className="font-medium text-green-800">{counts.done} {labels.done}</span>, <span className="font-medium text-amber-800">{counts.skipped} skipped</span>, <span className="font-medium text-red-800">{counts.failed} failed</span>.</p>
                <ul className="mt-3 divide-y divide-gray-100 rounded-md border border-gray-200 text-sm">
                  {results.map((result) => (
                    <li key={result.id} className="flex flex-wrap items-start justify-between gap-3 px-3 py-2">
                      <span className="font-medium text-[#0b1f3a]">{result.reference}</span>
                      <span className={`text-right ${result.outcome === "done" ? "text-green-800" : result.outcome === "skipped" ? "text-amber-800" : "text-red-800"}`}>{result.outcome === "done" ? "" : result.outcome === "skipped" ? "Skipped: " : "Failed: "}{result.message}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-5 flex justify-end"><button type="button" onClick={close} className="rounded-md bg-[#0b1f3a] px-4 py-1.5 text-sm font-medium text-white">Close</button></div>
              </>
            ) : (
              <>
                <h3 className="font-heading text-xl text-[#0b1f3a]">{labels.title}</h3>
                <p className="mt-1 text-sm text-gray-600">{chosen.length} submission{chosen.length === 1 ? "" : "s"}. Recorded now, by you. {emailNote}</p>
                {action === "payment" ? (
                  <div className="mt-3 overflow-x-auto rounded-md border border-gray-200">
                    <table className="w-full min-w-[820px] text-left text-sm">
                      <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-3 py-2">Reference</th><th className="px-3 py-2">Payee</th><th className="px-3 py-2">Mode</th><th className="px-3 py-2 text-right">Due</th><th className="px-3 py-2">Amount paid</th><th className="px-3 py-2">UTR / reference</th></tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {chosen.map((row) => {
                          const input = payments[row.id] ?? { amount: "", reference: "" };
                          const set = (patch: Partial<PaymentInput>) => setPayments((current) => ({ ...current, [row.id]: { ...input, ...patch } }));
                          const due = row.paymentMode === "NEFT" ? remainingFor(row) : Number(cashAmountFor(row) ?? 0);
                          return (
                            <tr key={row.id} className={rowErrors[row.id] ? "bg-red-50" : ""}>
                              <td className="px-3 py-2 align-top font-medium text-[#0b1f3a]">{row.reference}</td>
                              <td className="px-3 py-2 align-top">{row.payeeName}</td>
                              <td className="px-3 py-2 align-top">{row.paymentMode === "NEFT" ? "NEFT" : "Cash"}{row.isAdvance ? " (Advance)" : ""}</td>
                              <td className="whitespace-nowrap px-3 py-2 text-right align-top">{rupees(due)}</td>
                              <td className="px-3 py-2 align-top">
                                {row.paymentMode === "NEFT"
                                  ? <input aria-label={`Amount paid for ${row.reference}`} inputMode="decimal" value={input.amount} onChange={(event) => set({ amount: event.target.value })} className="w-32 rounded-md border border-gray-300 px-2 py-1 text-sm" />
                                  : <span title="Uses the saved Bill passed for Rs. (or payable amount), same as the single action">{rupees(due)}</span>}
                                {row.paymentMode === "NEFT" && Number(input.amount) > 0 && paise(input.amount) < paise(due) ? <div className="mt-1 text-xs text-amber-800">Partial payment</div> : null}
                              </td>
                              <td className="px-3 py-2 align-top">
                                {row.paymentMode === "NEFT"
                                  ? <input aria-label={`UTR or reference for ${row.reference}`} maxLength={200} value={input.reference} onChange={(event) => set({ reference: event.target.value })} placeholder="Required" className="w-44 rounded-md border border-gray-300 px-2 py-1 text-sm" />
                                  : <span className="text-xs text-gray-500">Not needed for Cash</span>}
                                {rowErrors[row.id] ? <div className="mt-1 text-xs font-medium text-red-700">{rowErrors[row.id]}</div> : null}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <ul className="mt-3 max-h-72 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200 text-sm">
                    {chosen.map((row) => <li key={row.id} className="flex justify-between gap-3 px-3 py-1.5"><span><span className="font-medium text-[#0b1f3a]">{row.reference}</span> <span className="text-gray-600">{row.payeeName}</span></span><span className="whitespace-nowrap">{rupees(Number(row.amount))}</span></li>)}
                  </ul>
                )}
                <p className="mt-2 flex justify-between text-sm font-semibold text-[#0b1f3a]"><span>Total</span><span>{rupees(payTotal)}</span></p>
                {error ? <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
                {progress ? <p role="status" className="mt-3 text-sm text-gray-600">{progress}</p> : null}
                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" onClick={close} disabled={busy} className={smallButton}>Cancel</button>
                  <button type="button" onClick={confirm} disabled={busy} className="rounded-md bg-[#2e8b57] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">{busy ? "Working..." : `Confirm (${chosen.length})`}</button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </BulkContext.Provider>
  );
}
