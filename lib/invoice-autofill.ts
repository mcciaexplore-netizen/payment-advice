import { z } from "zod";

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
});

export type InvoiceExtraction = z.infer<typeof invoiceExtractionSchema>;

function normalizedVendorName(value: string) {
  return value
    .toLowerCase()
    // MCCIA's own internal Tally/ledger tags (~9% of the vendor master
    // carries one of these, e.g. "...LLP-CR"), never part of a real
    // invoice's printed company name — strip before comparing, not just
    // legal-entity suffixes, or every tagged vendor's real invoices
    // silently fail to match.
    .replace(/(-(cr|new|jw))+$/i, "")
    .replace(/\b(private|pvt|limited|ltd|llp|incorporated|inc|co|company)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function levenshtein(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length];
}

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

  const scored = vendors
    .map((vendor) => {
      const name = normalizedVendorName(vendor.companyName);
      if (!name) return { vendor, score: 0 };
      if (name === query) return { vendor, score: 1 };
      const distance = levenshtein(query, name);
      return { vendor, score: 1 - distance / Math.max(query.length, name.length) };
    })
    .sort((a, b) => b.score - a.score);

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
