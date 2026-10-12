export function submissionPdfHref(advice: {
  id: string;
  paymentMode: string;
  isAdvance: boolean;
}): string {
  return advice.paymentMode === "CASH"
    ? `/api/advice/${advice.id}/cash-voucher-pdf`
    : `/api/advice/${advice.id}/pdf`;
}

/** Label for the dashboards' PDF button: "Download Payment Advice" /
 * "Download Cash Voucher" / "Download Advance", by the same paymentMode +
 * isAdvance rule as documentLabelFor (an advance is "Download Advance" on
 * either sub-route). Forwarding Memos and Cash Receipts live in their own
 * tables and never appear in these submissions lists. */
export function submissionPdfLabel(advice: { paymentMode: string; isAdvance: boolean }): string {
  if (advice.isAdvance) return "Download Advance";
  return advice.paymentMode === "CASH" ? "Download Cash Voucher" : "Download Payment Advice";
}
