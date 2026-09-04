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
 * Advance Payment (isAdvance = true, see AGENT_HANDOFF.md) layers on top of
 * either: "Advance Payment Advice" / "Advance Cash Voucher", with
 * advance_no as the primary number — superseding even cash_voucher_no for
 * a Cash-routed advance, since advance_no is the one shared series
 * regardless of NEFT/CASH sub-route.
 * serial_no remains the internal DB/audit-log/Excel identifier regardless
 * of mode or advance status — this is purely about what a human should see
 * as "the number."
 */
export function documentLabelFor(paymentMode: PaymentMode, isAdvance = false): string {
  if (isAdvance) {
    // Not a mechanical "Advance " + base prefix — "Advance Cash Voucher"
    // drops "Payment" entirely, per the exact naming this feature specifies.
    return paymentMode === "CASH" ? "Advance Cash Voucher" : "Advance Payment Advice";
  }
  return paymentMode === "CASH" ? "Cash Payment Voucher" : "Payment Advice";
}

/** Short, unambiguous queue badge; unlike documentLabelFor this deliberately
 * collapses both Advance sub-routes into the one business submission type. */
export function submissionTypeLabelFor(paymentMode: PaymentMode, isAdvance = false): string {
  if (isAdvance) return "Advance Payment";
  return paymentMode === "CASH" ? "Cash Voucher" : "Payment Advice";
}

/** Falls back to serialNo if cashVoucherNo/advanceNo are unexpectedly null
 * for a row that should have one (should never happen post-cutover, but
 * stays safe rather than ever rendering "undefined"/blank as the primary
 * number). isAdvance takes priority over the CASH/NEFT branch — advance_no
 * is the primary number for an advance regardless of which underlying
 * pipeline it's routed to. */
export function displayNoFor(
  paymentMode: PaymentMode,
  serialNo: string,
  cashVoucherNo: string | null,
  isAdvance = false,
  advanceNo: string | null = null,
): string {
  if (isAdvance) return advanceNo ?? serialNo;
  return paymentMode === "CASH" ? (cashVoucherNo ?? serialNo) : serialNo;
}

/** The label shown next to the "Bill passed for Rs." / "Amount Sanctioned"
 * field — same underlying billPassedFor column, just conditional label
 * text for advances (no invoice exists yet, so "the amount Finance has
 * confirmed/sanctioned" reads more accurately than "the bill passed"). */
export function billPassedForLabelFor(isAdvance: boolean): string {
  return isAdvance ? "Amount Sanctioned" : "Bill passed for Rs.";
}
