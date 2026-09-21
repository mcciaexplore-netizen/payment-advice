/** Flags a submission where Gemini invoice auto-fill detected the invoice's
 * own printed bank details contradicting the vendor's known system-of-record
 * account — the account actually saved is always the system one; this is
 * purely a signal for Finance to double-check (stale invoice, or a genuine
 * vendor-bank-change/fraud red flag) before paying. See
 * lib/invoice-autofill.ts's bankDetailsMismatch(). */
export function BankDetailsMismatchBadge({ bankDetailsMismatch }: { bankDetailsMismatch: boolean }) {
  if (!bankDetailsMismatch) return null;

  return (
    <span
      title="The invoice's printed bank details didn't match what's on file for this vendor — the system record was used. Verify before paying."
      className="inline-flex items-center gap-1 rounded-full bg-[#b3261e]/10 px-2 py-0.5 text-[11px] font-semibold text-[#b3261e]"
    >
      ⚠ Bank details mismatch
    </span>
  );
}
