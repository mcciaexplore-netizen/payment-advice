import type { AdminRole } from "@/lib/auth";
import type { PaymentMode } from "@/lib/validation/payment-advice";

/** Mirrors the Submissions landing-page convention. This is a default data
 * scope for role-specific views, not an authorization boundary. */
export function defaultPaymentModeForRole(role: AdminRole): PaymentMode | undefined {
  if (role === "PAYMENT_ADVICE") return "NEFT";
  if (role === "CASH_VOUCHER") return "CASH";
  return undefined;
}

/** Multi-role version — a session now carries a list of roles, not one.
 * ALL (held directly, or alongside AUTHORITY as for a dual-role account
 * like Chintamani's) always means "show everything," same as it always
 * has. A single non-AUTHORITY role behaves exactly as before. Holding
 * more than one *narrow* Finance role (PAYMENT_ADVICE + CASH_VOUCHER —
 * not expected today, but not precluded by the schema) also means "show
 * everything," since neither one alone would be a correct default. */
export function defaultPaymentModeForRoles(roles: AdminRole[]): PaymentMode | undefined {
  if (roles.includes("ALL")) return undefined;
  const financeRoles = roles.filter((r) => r !== "AUTHORITY");
  if (financeRoles.length === 1) return defaultPaymentModeForRole(financeRoles[0]);
  return undefined;
}

/** Whether these roles "own" a submission's payment mode for payment
 * actions: ALL owns both, PAYMENT_ADVICE owns NEFT, CASH_VOUCHER owns Cash.
 * Moved here from components/admin/AdviceActions.tsx (2026-10-30) so the
 * single-item payment buttons and the bulk payment action use one rule. The
 * single-item routes still do not enforce it (unchanged UI-only default);
 * the bulk route does, per item. */
export function ownsSubmissionType(roles: AdminRole[], paymentMode: "NEFT" | "CASH"): boolean {
  if (roles.includes("ALL")) return true;
  if (paymentMode === "NEFT") return roles.includes("PAYMENT_ADVICE");
  return roles.includes("CASH_VOUCHER");
}
