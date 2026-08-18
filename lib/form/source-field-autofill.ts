export type FieldAutoFillAction = { type: "fill"; value: string } | { type: "clear" } | { type: "none" };

/** Generic version of resolveAutoFillEmail's "only react on an actual
 * source-value change, never fight the user" pattern — used for Advance
 * Payment's Payee Name/Email auto-fill from the Submitter's Name/Email
 * (an advance's payee IS the submitter, so there's no vendor to search).
 * Unlike resolveAutoFillEmail, the "source" here is a plain field the
 * submitter types into directly (Section 1), not an async typeahead match,
 * so the caller re-evaluates this on every keystroke of the source field —
 * the `lastAutoFilledValue` bookkeeping is what keeps that from fighting a
 * manual edit or an /edit/[token] resubmit prefill.
 *
 * `lastAutoFilledValue` is whatever this same logic set on the *previous*
 * call (or null if it never auto-filled anything yet) — the caller tracks
 * it in a ref, updated only when this returns "fill" or "clear". A target
 * field holding exactly that value is treated as our own stale auto-fill,
 * safe to replace; anything else is left alone. */
export function resolveSourceFieldAutoFill(
  sourceValue: string,
  currentValue: string,
  lastAutoFilledValue: string | null,
): FieldAutoFillAction {
  const isEmpty = currentValue === "";
  const isOurOwnStaleFill = !isEmpty && currentValue === lastAutoFilledValue;

  if (!isEmpty && !isOurOwnStaleFill) {
    // A manual edit, or a value already on the form for a reason of its own
    // (e.g. an /edit/[token] resubmit prefill) — never touch it.
    return { type: "none" };
  }

  if (sourceValue) return { type: "fill", value: sourceValue };
  // The source field is empty: clear a stale auto-fill left over from
  // before, but there's nothing to do to an already-empty field.
  return isOurOwnStaleFill ? { type: "clear" } : { type: "none" };
}
