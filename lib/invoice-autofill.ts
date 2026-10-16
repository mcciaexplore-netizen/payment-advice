import { z } from "zod";
import { normalizedVendorName, scoreVendorsByName } from "@/lib/advice/vendor-name-matching";

/**
 * This is deliberately conservative: an extracted company name must be an
 * extremely close match to an active vendor before the form selects it. The
 * extraction feature is allowed to save typing; it is never allowed to
 * create a vendor or turn a free-text invoice name into a valid selection.
 */
export type InvoiceVendorCandidate = {
  id: string;
  companyName: string;
  contactPerson: string | null;
  contactPhone: string | null;
  address: string | null;
  email: string | null;
  gstin: string | null;
  udyamNumber: string | null;
};

export const invoiceExtractionSchema = z.object({
  billNo: z.string().trim().min(1).max(200).nullable(),
  billDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  basicAmount: z.number().finite().nonnegative().max(99_999_999.99).nullable(),
  gstAmount: z.number().finite().nonnegative().max(99_999_999.99).nullable(),
  payeeName: z.string().trim().min(1).max(500).nullable(),
  // The invoice issuer's own bank details, when printed on the invoice —
  // used only as a fallback when we have no bank account already on file
  // for the matched vendor (or no vendor was confidently matched at all).
  // Never used to override a known system record; see the route handler.
  bankAccountNo: z.string().trim().min(1).max(50).nullable(),
  bankIfsc: z.string().trim().min(1).max(20).nullable(),
  // The bank's own name (e.g. "Kotak Mahindra Bank"), printed alongside the
  // account/IFSC on the same bank details section. Unlike account/IFSC,
  // there's no per-vendor system record to prefer over this — Bank Name is
  // a plain submission field, always filled directly when present.
  bankName: z.string().trim().min(1).max(200).nullable(),
});

export type InvoiceExtraction = z.infer<typeof invoiceExtractionSchema>;

/**
 * Exact normalized matches are accepted. For a true fuzzy match, require at
 * least 95% similarity *and* a unique best candidate. Near names (which are
 * common in vendor masters) are intentionally left for the usual dropdown.
 */
export function findConfidentInvoiceVendor(
  extractedName: string | null,
  vendors: InvoiceVendorCandidate[],
): InvoiceVendorCandidate | null {
  if (!extractedName) return null;
  const query = normalizedVendorName(extractedName);
  if (query.length < 4) return null;

  const scored = scoreVendorsByName(extractedName, vendors);

  const best = scored[0];
  const next = scored[1];
  if (!best || best.score < 0.95) return null;
  if (next && best.score - next.score < 0.03) return null;
  return best.vendor;
}

function normalizedBankValue(value: string) {
  return value.replace(/\s+/g, "").toUpperCase();
}

/**
 * True when the invoice's own printed bank details contradict the vendor's
 * known system-of-record account — a real signal worth flagging, since it
 * can mean a stale invoice or a genuine vendor-bank-change/fraud attempt.
 * The system record always wins for what's actually saved (see
 * PaymentAdviceForm.tsx's applyVendorBankAccount); this only decides
 * whether to raise the flag. Only compares a field the invoice actually
 * extracted a value for — missing invoice data is never treated as a
 * contradiction.
 */
export function bankDetailsMismatch(
  systemAccount: { bankAccountNo: string; bankIfsc: string },
  invoiceExtracted: { bankAccountNo: string | null; bankIfsc: string | null },
): boolean {
  const accountDiffers =
    !!invoiceExtracted.bankAccountNo &&
    normalizedBankValue(invoiceExtracted.bankAccountNo) !== normalizedBankValue(systemAccount.bankAccountNo);
  const ifscDiffers =
    !!invoiceExtracted.bankIfsc &&
    normalizedBankValue(invoiceExtracted.bankIfsc) !== normalizedBankValue(systemAccount.bankIfsc);
  return accountDiffers || ifscDiffers;
}

/** Beneficiary Name to fill from an invoice auto-fill, or null to leave the
 * field alone. Same rule as before PR #6, plus a no-overwrite guard:
 * - only when the invoice also printed the issuer's bank account number or
 *   IFSC (a bare supplier name is not evidence of who holds the account);
 * - the matched vendor's company name is preferred over the raw invoice
 *   payee text;
 * - never replaces anything the submitter has already typed. */
export function invoiceBeneficiaryName(
  autoFill: { bankAccountNo?: string | null; bankIfsc?: string | null; payeeName?: string | null; vendor?: { companyName: string } | null },
  currentBeneficiaryName: string | null | undefined,
): string | null {
  if (!autoFill.bankAccountNo && !autoFill.bankIfsc) return null;
  if ((currentBeneficiaryName ?? "").trim()) return null;
  return autoFill.vendor?.companyName?.trim() || autoFill.payeeName?.trim() || null;
}
