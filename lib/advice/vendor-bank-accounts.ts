import { db } from "@/lib/db";
import { vendorBankAccounts } from "@/lib/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Captures (or refreshes) a vendor's bank details after a successful
 * regular Payment Advice (NEFT) submission, so a later submitter paying the
 * same vendor can be offered it instead of retyping from scratch — see
 * lib/advice/vendor-bank-selection.ts for how the form actually offers it
 * back. Deduplicates on (vendor, account, IFSC), the same key the historical
 * backfill (scripts/backfill-vendor-bank-accounts.ts) used. Only
 * `last_used_at` is touched on a repeat combination — `beneficiary_name`
 * from the very first capture is deliberately left alone on every later
 * reuse, not overwritten, so a later submission's spelling drift (or typo)
 * can never silently clobber a name that's already correct. */
export async function captureVendorBankAccount(
  tx: Tx,
  input: {
    vendorId: string;
    bankAccountNo: string;
    bankIfsc: string;
    beneficiaryName: string;
    sourceAdviceId: string;
    usedAt: Date;
  },
): Promise<void> {
  await tx
    .insert(vendorBankAccounts)
    .values({
      vendorId: input.vendorId,
      bankAccountNo: input.bankAccountNo,
      bankIfsc: input.bankIfsc,
      beneficiaryName: input.beneficiaryName,
      sourceAdviceId: input.sourceAdviceId,
      lastUsedAt: input.usedAt,
    })
    .onConflictDoUpdate({
      target: [vendorBankAccounts.vendorId, vendorBankAccounts.bankAccountNo, vendorBankAccounts.bankIfsc],
      set: { lastUsedAt: input.usedAt },
    });
}
