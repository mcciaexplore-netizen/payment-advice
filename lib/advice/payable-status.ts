/** Whether an item has the saved amount its payment action needs, using
 * only stored values (nothing is recalculated):
 * - NEFT (Payment Advice or Advance): the saved payable amount from the
 *   Arrears/TDS calculator (basic amount minus TDS);
 * - Cash Voucher: the saved Bill passed for;
 * - Cash-routed Advance: the saved payable amount.
 * Same rule the single-item payment actions and the bulk server checks
 * apply; shared by the bulk screen and the Submissions page. */
export function payableIsSet(row: { paymentMode: string; isAdvance: boolean; payableAmount: string | null; billPassedFor: string | null }): boolean {
  if (row.paymentMode === "CASH" && !row.isAdvance) return row.billPassedFor !== null;
  return row.payableAmount !== null;
}

/** "Payable amount not set" / "Bill passed for not set". */
export function payableNotSetLabel(row: { paymentMode: string; isAdvance: boolean }): string {
  return row.paymentMode === "CASH" && !row.isAdvance ? "Bill passed for not set" : "Payable amount not set";
}
