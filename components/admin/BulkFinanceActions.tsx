"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { bulkPayable, dueFor, paymentRowError, prefillAmount, usesBasic } from "@/lib/advice/bulk-payment-rows";

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
  /** Stored Basic and GST (NEFT Payment Advice); null for Cash and Advances. */
  basicAmount: string | null;
  gstAmount: string | null;
  /** The item's detail page, where the payable calculation is saved. */
  href: string;
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

type Ctx = { action: BulkAction; selected: Set<string>; toggle: (id: string) => void; setAll: (ids: string[]) => void; rows: BulkRow[] };
const BulkContext = createContext<Ctx | null>(null);

export function BulkRowCheckbox({ id }: { id: string }) {
  const ctx = useContext(BulkContext);
  const row = ctx?.rows.find((candidate) => candidate.id === id);
  if (!ctx || !row) return null;
  // Rows with no saved payable calculation are paid on Basic (Cash Voucher:
  // the voucher amount). Only a row with neither (a Cash-routed Advance
  // without its payable, or no Basic stored) stays out of the selection.
  if (ctx.action === "payment" && !bulkPayable(row)) {
    return <a href={row.href} title="Payable amount not set. Open the item to set it." className="inline-block whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 hover:underline">Set payable first</a>;
  }
  if (!row.selectable) return null;
  return <input type="checkbox" aria-label={`Select ${row.reference}`} checked={ctx.selected.has(id)} onChange={() => ctx.toggle(id)} />;
}

export function BulkSelectAll() {
  const ctx = useContext(BulkContext);
  if (!ctx) return null;
  const selectable = ctx.rows.filter((row) => row.selectable && (ctx.action !== "payment" || bulkPayable(row))).map((row) => row.id).slice(0, MAX_ITEMS);
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
      const row = byId.get(id);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_ITEMS && row && (action !== "payment" || bulkPayable(row))) next.add(id);
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
      // Prefill: the Due amount (payable minus paid so far; Basic when no
      // payable calculation is saved), editable.
      for (const row of chosen) initial[row.id] = payments[row.id] ?? { amount: prefillAmount(row), reference: "" };
      setPayments(initial);
    }
    setOpen(true);
  }

  /** Browser-side copy of the server's row rules, for instant feedback. */
  function validateLocally(): Record<string, string> {
    const errors: Record<string, string> = {};
    for (const row of chosen) {
      const error = paymentRowError(row, payments[row.id] ?? { amount: "" });
      if (error) errors[row.id] = error;
    }
    return errors;
  }

  function itemsFor(list: BulkRow[]) {
    return list.map((row) => action === "payment" && row.paymentMode === "NEFT"
      ? { id: row.id, amount: Number(payments[row.id].amount), ...(payments[row.id].reference.trim() ? { reference: payments[row.id].reference.trim() } : {}), expectedTotalPaid: Number(row.totalPaid).toFixed(2) }
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
    : action === "verify" ? "Each submitter gets the usual Verified email, one per submission. NEFT items without a payable calculation will be paid on Basic with no deductions in bulk payment."
      : "Each submitter gets the usual email, one per submission: Payment Done for Cash, Payment recorded for NEFT.";
  const payTotal = action === "payment"
    ? chosen.reduce((sum, row) => sum + paise(row.paymentMode === "NEFT" ? payments[row.id]?.amount || 0 : dueFor(row) ?? 0), 0) / 100
    : total;
  const onBasic = action === "payment" ? chosen.filter((row) => usesBasic(row)) : [];
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
                  <>
                  <p className="mt-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">GST is settled separately, one by one, from each item. This records the basic payment only.</p>
                  <div className="mt-3 overflow-x-auto rounded-md border border-gray-200">
                    <table className="w-full min-w-[1040px] text-left text-sm">
                      <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-3 py-2">Reference</th><th className="px-3 py-2">Payee</th><th className="px-3 py-2">Mode</th><th className="px-3 py-2 text-right">Basic amount</th><th className="px-3 py-2 text-right">GST amount</th><th className="px-3 py-2 text-right">Payable</th><th className="px-3 py-2 text-right">Due</th><th className="px-3 py-2">Amount paid</th><th className="px-3 py-2">UTR / Reference (optional)</th></tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {chosen.map((row) => {
                          const input = payments[row.id] ?? { amount: "", reference: "" };
                          const set = (patch: Partial<PaymentInput>) => setPayments((current) => ({ ...current, [row.id]: { ...input, ...patch } }));
                          const payableOk = bulkPayable(row);
                          const onBasicRow = usesBasic(row);
                          const neft = row.paymentMode === "NEFT";
                          const payable = neft ? row.payableAmount : row.isAdvance ? row.payableAmount : row.billPassedFor;
                          const due = dueFor(row) ?? 0;
                          const money = (value: string | null) => value === null ? "-" : rupees(Number(value));
                          // An NEFT Advance has no separate Basic: its amount is the base.
                          const basic = neft && row.isAdvance ? row.amount : row.basicAmount;
                          return (
                            <tr key={row.id} className={rowErrors[row.id] ? "bg-red-50" : !payableOk ? "bg-amber-50/60" : ""}>
                              <td className="px-3 py-2 align-top font-medium text-[#0b1f3a]">{row.reference}</td>
                              <td className="px-3 py-2 align-top">{row.payeeName}</td>
                              <td className="px-3 py-2 align-top">{neft ? "NEFT" : "Cash"}{row.isAdvance ? " (Advance)" : ""}</td>
                              <td className="whitespace-nowrap px-3 py-2 text-right align-top">{money(basic)}</td>
                              <td className="whitespace-nowrap px-3 py-2 text-right align-top">{money(row.gstAmount)}</td>
                              <td className="px-3 py-2 text-right align-top">
                                {!payableOk ? <span className="text-amber-800">Not set</span>
                                  : onBasicRow ? <span className="text-xs text-sky-900">Not set, {neft ? "Basic" : "voucher amount"} will be used</span>
                                    : <span className="whitespace-nowrap">{money(payable)}</span>}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-right align-top font-medium">{payableOk ? rupees(due) : <span className="font-normal text-amber-800">Not set</span>}</td>
                              <td className="px-3 py-2 align-top">
                                {!payableOk
                                  ? <span className="text-xs text-amber-800">Payable amount not set. <a href={row.href} className="font-medium underline">Open to set</a></span>
                                  : neft
                                    ? <input aria-label={`Amount paid for ${row.reference}`} inputMode="decimal" value={input.amount} onChange={(event) => set({ amount: event.target.value })} className="w-32 rounded-md border border-gray-300 px-2 py-1 text-sm" />
                                    : <span title={onBasicRow ? "No Bill passed for saved: the voucher amount is used" : "Uses the saved Bill passed for Rs. (or payable amount), same as the single action"}>{rupees(due)}</span>}
                                {payableOk && neft && Number(input.amount) > 0 && paise(input.amount) < paise(due) ? <div className="mt-1 text-xs text-amber-800">Partial payment</div> : null}
                              </td>
                              <td className="px-3 py-2 align-top">
                                {neft
                                  ? <input aria-label={`UTR or reference for ${row.reference}`} maxLength={200} value={input.reference} disabled={!payableOk} onChange={(event) => set({ reference: event.target.value })} className="w-44 rounded-md border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-100" />
                                  : <span className="text-xs text-gray-500">Not needed for Cash</span>}
                                {rowErrors[row.id] ? <div className="mt-1 text-xs font-medium text-red-700">{rowErrors[row.id]}</div> : null}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  </>
                ) : (
                  <ul className="mt-3 max-h-72 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200 text-sm">
                    {chosen.map((row) => <li key={row.id} className="flex justify-between gap-3 px-3 py-1.5"><span><span className="font-medium text-[#0b1f3a]">{row.reference}</span> <span className="text-gray-600">{row.payeeName}</span></span><span className="whitespace-nowrap">{rupees(Number(row.amount))}</span></li>)}
                  </ul>
                )}
                <p className="mt-2 flex justify-between text-sm font-semibold text-[#0b1f3a]"><span>{action === "payment" ? "Total basic being paid (GST not included)" : "Total"}</span><span>{rupees(payTotal)}</span></p>
                {onBasic.length ? (
                  <div className="mt-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                    <p className="font-medium">{onBasic.length} item{onBasic.length === 1 ? " has" : "s have"} no payable calculation, paid on Basic with no deductions (no TDS){onBasic.some((row) => row.paymentMode === "CASH") ? "; Cash Vouchers on the voucher amount" : ""}:</p>
                    <p className="mt-1">{onBasic.map((row) => row.reference).join(", ")}</p>
                  </div>
                ) : null}
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
