import { hasFinanceRole, hasRole, type AdminSessionPayload } from "@/lib/auth";

/** Whether this session may view or download a given Cash Receipt.
 * Finance sessions (PAYMENT_ADVICE/CASH_VOUCHER/ALL) can open any receipt.
 * A BRANCH (Cash Receipt login / Team Dashboard) session may only open a
 * receipt it personally issued, never another branch member's, even one
 * from the same branch - this is the one real check both the View page and
 * the Download route call, so the rule can never drift between the two. */
export function canAccessCashReceipt(
  session: AdminSessionPayload | null,
  receipt: { issuedByUserId: string },
): boolean {
  if (!session) return false;
  if (hasFinanceRole(session)) return true;
  return hasRole(session, "BRANCH") && session.adminUserId === receipt.issuedByUserId;
}
