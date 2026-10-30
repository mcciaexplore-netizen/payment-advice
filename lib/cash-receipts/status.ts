import { formatIstDate } from "@/lib/date-time";

export type CashReceiptReceivedState = {
  receivedAt: Date | string | null;
  receivedBy: string | null;
};

/** "Pending" or "Received on 30/10/2026 by Abha Khatavkar": the one
 * wording used on the Finance list and on the issuer's own dashboard. */
export function cashReceiptStatusText(receipt: CashReceiptReceivedState): string {
  if (!receipt.receivedAt) return "Pending";
  return `Received on ${formatIstDate(receipt.receivedAt)} by ${receipt.receivedBy ?? "Finance"}`;
}
