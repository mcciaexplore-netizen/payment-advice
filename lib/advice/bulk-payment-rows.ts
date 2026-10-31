import { payableIsSet, payableNotSetLabel } from "@/lib/advice/payable-status";

/** Pure rules for one row of the bulk "Record payments" table, shared by
 * the screen and its tests. The server re-checks everything
 * (lib/advice/bulk-finance-actions.ts validatePaymentRow). */
export type PaymentRow = {
  paymentMode: "NEFT" | "CASH";
  isAdvance: boolean;
  payableAmount: string | null;
  billPassedFor: string | null;
  totalPaid: string;
};

const paise = (value: string | number) => Math.round(Number(value) * 100);

/** NEFT Due: saved payable amount minus what is paid so far; null when the
 * payable amount is not set (shown as "Not set", never 0.00). Cash: the
 * saved Bill passed for (or, for an Advance, the saved payable amount). */
export function dueFor(row: PaymentRow): number | null {
  if (!payableIsSet(row)) return null;
  if (row.paymentMode === "NEFT") return (paise(row.payableAmount!) - paise(row.totalPaid)) / 100;
  return Number(row.isAdvance ? row.payableAmount : row.billPassedFor);
}

/** Amount paid prefill: the Due amount, as text for the input. */
export function prefillAmount(row: PaymentRow): string {
  const due = dueFor(row);
  return due === null ? "" : due.toFixed(2);
}

/** Error for a row's input, or null when it may be paid. The UTR or
 * reference is optional. Never more than Due. */
export function paymentRowError(row: PaymentRow, input: { amount: string }): string | null {
  if (!payableIsSet(row)) return `${payableNotSetLabel(row)}. Open the item to set it.`;
  if (row.paymentMode !== "NEFT") return null;
  const raw = input.amount.trim();
  const amount = Number(raw);
  if (!raw || !Number.isFinite(amount) || amount <= 0) return "Enter an amount greater than 0.";
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return "At most 2 decimal places.";
  const due = dueFor(row)!;
  if (paise(amount) > paise(due)) return `More than the Due of ₹ ${due.toLocaleString("en-IN", { minimumFractionDigits: 2 })}.`;
  return null;
}
