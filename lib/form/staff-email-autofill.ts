export type EmailAutoFillAction = { type: "fill"; email: string } | { type: "clear" } | { type: "none" };

/** Decides what (if anything) to do to "Your Email" when the matched staff
 * member changes on the public form. Pure logic, extracted out of
 * PaymentAdviceForm.tsx so it's testable without rendering React — mirrors
 * `RecommendingAuthorityField`'s "only React on an actual identity change,
 * never fight the user" pattern, extended to also handle the email field's
 * extra wrinkle: unlike the Authority field (which has no independent
 * free-typed fallback tied to the same value), a stale auto-filled email
 * needs to be told apart from a real manual edit so a later match change
 * can safely replace the former but must never touch the latter.
 *
 * `lastAutoFilledEmail` is whatever this same logic set on the *previous*
 * call (or null if it never auto-filled anything yet) — the caller is
 * expected to track it in a ref, updated only when this returns "fill" or
 * "clear". A field holding exactly that value is treated as our own stale
 * auto-fill, safe to replace; anything else (a manual edit, or a value
 * pre-filled by an /edit/[token] resubmission) is left alone. */
export function resolveAutoFillEmail(
  staff: { email: string | null } | null,
  currentEmail: string,
  lastAutoFilledEmail: string | null,
): EmailAutoFillAction {
  const isEmpty = currentEmail === "";
  const isOurOwnStaleFill = !isEmpty && currentEmail === lastAutoFilledEmail;

  if (!isEmpty && !isOurOwnStaleFill) {
    // A manual edit, or a value already on the form for a reason of its
    // own (e.g. an /edit/[token] resubmit prefill) — never touch it.
    return { type: "none" };
  }

  const staffEmail = staff?.email ?? null;
  if (staffEmail) return { type: "fill", email: staffEmail };
  // The newly matched staff member has no email on file (or there's no
  // match at all): clear a stale auto-fill left over from a previous
  // match, but there's nothing to do to an already-empty field.
  return isOurOwnStaleFill ? { type: "clear" } : { type: "none" };
}
