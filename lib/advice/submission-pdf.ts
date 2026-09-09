export function submissionPdfHref(advice: {
  id: string;
  paymentMode: string;
  isAdvance: boolean;
}): string {
  return advice.paymentMode === "CASH"
    ? `/api/advice/${advice.id}/cash-voucher-pdf`
    : `/api/advice/${advice.id}/pdf`;
}
