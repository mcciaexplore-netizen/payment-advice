/** Decides whether a matched staff member's email should auto-fill "Your
 * Email" on the public form. Pure logic extracted out of
 * PaymentAdviceForm.tsx so it's testable without rendering React —
 * mirrors applyVendor's "fill only what's on file" pattern in that file:
 * never overwrites a value already present (whether the submitter typed
 * it, or it was pre-filled from an /edit/[token] resubmission), and
 * leaves the field empty (not an error) when the matched staff member has
 * no email on file. */
export function resolveAutoFillEmail(
  staff: { email: string | null } | null,
  currentEmail: string | undefined,
): string | null {
  if (currentEmail) return null;
  if (!staff?.email) return null;
  return staff.email;
}
