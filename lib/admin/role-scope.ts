import type { AdminRole } from "@/lib/auth";
import type { PaymentMode } from "@/lib/validation/payment-advice";

/** Mirrors the Submissions landing-page convention. This is a default data
 * scope for role-specific views, not an authorization boundary. */
export function defaultPaymentModeForRole(role: AdminRole): PaymentMode | undefined {
  if (role === "PAYMENT_ADVICE") return "NEFT";
  if (role === "CASH_VOUCHER") return "CASH";
  return undefined;
}
