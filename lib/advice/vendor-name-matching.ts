/**
 * Shared vendor-name fuzzy-matching primitives, extracted from
 * lib/invoice-autofill.ts (where this algorithm originated for the Gemini
 * invoice auto-fill's strict, confident-only auto-select) so a second,
 * deliberately more lenient caller - the vendor-request duplicate-check
 * warning (lib/advice/vendor-requests.ts) - can reuse the exact same
 * normalization/scoring instead of re-implementing it with a different
 * (and possibly inconsistent) notion of "similar name". Relocating these
 * here changed nothing about findConfidentInvoiceVendor's own behavior -
 * same functions, same thresholds, just importable from one place.
 */

export type VendorNameCandidate = { id: string; companyName: string };

export function normalizedVendorName(value: string) {
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

export function levenshtein(left: string, right: string) {
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

/** Normalized-name similarity score in [0, 1] for every candidate, sorted
 * best-first. 1 = exact normalized match. Callers decide their own
 * threshold/uniqueness gate - see findConfidentInvoiceVendor (strict,
 * >=95% + unique, for silent auto-select) vs. findPossibleDuplicateVendors
 * (lenient, for a human-reviewed warning). */
export function scoreVendorsByName<T extends VendorNameCandidate>(
  query: string,
  candidates: T[],
): { vendor: T; score: number }[] {
  const normalizedQuery = normalizedVendorName(query);
  if (!normalizedQuery) return candidates.map((vendor) => ({ vendor, score: 0 }));
  return candidates
    .map((vendor) => {
      const name = normalizedVendorName(vendor.companyName);
      if (!name) return { vendor, score: 0 };
      if (name === normalizedQuery) return { vendor, score: 1 };
      const distance = levenshtein(normalizedQuery, name);
      return { vendor, score: 1 - distance / Math.max(normalizedQuery.length, name.length) };
    })
    .sort((a, b) => b.score - a.score);
}
