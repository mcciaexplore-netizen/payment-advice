import { payableIsSet } from "@/lib/advice/payable-status";

/** Pure rules for one row of the bulk "Record payments" table, shared by
 * the screen and its tests. The server re-checks everything
 * (lib/advice/bulk-finance-actions.ts validatePaymentRow). */
export type PaymentRow = {
  paymentMode: "NEFT" | "CASH";
  isAdvance: boolean;
  amount: string;
  basicAmount: string | null;
  payableAmount: string | null;
  billPassedFor: string | null;
  totalPaid: string;
};

const paise = (value: string | number) => Math.round(Number(value) * 100);

/** What bulk pays an item with no saved payable calculation, with no
 * deductions: NEFT the Basic amount (an Advance: its amount, the same base
 * the calculator uses); a Cash Voucher its stored amount. A Cash-routed
 * Advance has none: it still needs its saved payable amount. */
export function basisFor(row: PaymentRow): string | null {
  if (row.paymentMode === "CASH") return row.isAdvance ? null : row.amount;
  const basis = row.isAdvance ? row.amount : row.basicAmount;
  return basis !== null && Number(basis) > 0 ? basis : null;
}

/** True when the row has no saved payable calculation and bulk will pay it
 * on Basic (Cash Voucher: the voucher amount) with no deductions. */
export function usesBasic(row: PaymentRow): boolean {
  return !payableIsSet(row) && basisFor(row) !== null;
}

/** Whether bulk can pay the row at all. */
export function bulkPayable(row: PaymentRow): boolean {
  return payableIsSet(row) || usesBasic(row);
}

/** NEFT Due: saved payable amount (or, when not set, Basic) minus what is
 * paid so far. Cash: the saved Bill passed for (or, for an Advance, the
 * saved payable amount), else the voucher amount. Null when bulk cannot
 * pay the row. */
export function dueFor(row: PaymentRow): number | null {
  if (!bulkPayable(row)) return null;
  if (row.paymentMode === "NEFT") return (paise(row.payableAmount ?? basisFor(row)!) - paise(row.totalPaid)) / 100;
  if (usesBasic(row)) return Number(basisFor(row));
  return Number(row.isAdvance ? row.payableAmount : row.billPassedFor);
}

/** Amount paid prefill: the Due amount, as text for the input. */
export function prefillAmount(row: PaymentRow): string {
  const due = dueFor(row);
  return due === null ? "" : due.toFixed(2);
}

/** Error for a row's input, or null when it may be paid. The UTR or
 * reference is optional. Never more than Due (Basic when not set). */
export function paymentRowError(row: PaymentRow, input: { amount: string }): string | null {
  if (!bulkPayable(row)) return row.paymentMode === "CASH" ? "Payable amount not set. Open the item to set it." : "Basic amount not available. Open the item to set the payable.";
  if (row.paymentMode !== "NEFT") return null;
  const raw = input.amount.trim();
  const amount = Number(raw);
  if (!raw || !Number.isFinite(amount) || amount <= 0) return "Enter an amount greater than 0.";
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return "At most 2 decimal places.";
  const due = dueFor(row)!;
  if (paise(amount) > paise(due)) return `More than the ${usesBasic(row) ? "Basic amount" : "Due"} of ₹ ${due.toLocaleString("en-IN", { minimumFractionDigits: 2 })}.`;
  return null;
}
