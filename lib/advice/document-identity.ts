import type { PaymentMode } from "@/lib/validation/payment-advice";

/**
 * Single source of truth for "what do we call this submission, and what
 * number do we show as the primary one." The whole point of this file is
 * to prevent the class of bug it was built to fix (see AGENT_HANDOFF.md,
 * "Cash Voucher display/labeling consistency" session): every surface —
 * emails, the public confirmation/authority-approval/edit pages, the admin
 * queue and detail pages — must derive this the same way, not each
 * hardcode "Payment Advice"/serial_no independently.
 *
 * Rule: NEFT stays "Payment Advice" + serial_no everywhere, unchanged.
 * CASH becomes "Cash Payment Voucher" + cash_voucher_no everywhere.
 * serial_no remains the internal DB/audit-log/Excel identifier regardless
 * of mode — this is purely about what a human should see as "the number."
 */
export function documentLabelFor(paymentMode: PaymentMode): string {
  return paymentMode === "CASH" ? "Cash Payment Voucher" : "Payment Advice";
}

/** Falls back to serialNo if cashVoucherNo is unexpectedly null for a CASH
 * row (should never happen post-2026-08-01, but stays safe rather than
 * ever rendering "undefined"/blank as the primary number). */
export function displayNoFor(
  paymentMode: PaymentMode,
  serialNo: string,
  cashVoucherNo: string | null,
): string {
  return paymentMode === "CASH" ? (cashVoucherNo ?? serialNo) : serialNo;
}
