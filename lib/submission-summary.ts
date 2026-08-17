/**
 * The /submitted/[serial] confirmation page must not re-fetch a payment
 * advice from the server by serial number: serials are sequential and
 * guessable ("MCCIA/2026-27/0001", "...0002", ...), so a public lookup
 * route would let anyone enumerate other people's submissions — including
 * bank account details. Instead the just-submitted summary is handed off
 * through sessionStorage at redirect time and read back once, client-side.
 */
export type SubmissionSummary = {
  id: string;
  serialNo: string;
  cashVoucherNo: string | null;
  isAdvance: boolean;
  advanceNo: string | null;
  payeeName: string;
  amount: number;
  billNo: string;
  paymentMode: "NEFT" | "CASH";
  submittedByName: string;
  submittedByDepartment: string;
  natureOfExpenditure: string;
  authorityToken: string;
  authorityName: string;
};

function storageKey(serialNo: string) {
  return `mccia:submission:${serialNo}`;
}

export function storeSubmissionSummary(summary: SubmissionSummary) {
  try {
    sessionStorage.setItem(storageKey(summary.serialNo), JSON.stringify(summary));
  } catch {
    // sessionStorage can be unavailable (private browsing, storage full) —
    // the confirmation page degrades to a minimal message in that case.
  }
}

// Cache the last parsed result per raw string so repeated reads of an
// unchanged sessionStorage value return the same object reference — required
// for useSyncExternalStore's getSnapshot to be stable across renders.
const parsedCache = new Map<string, SubmissionSummary | null>();

export function readSubmissionSummary(serialNo: string): SubmissionSummary | null {
  try {
    const raw = sessionStorage.getItem(storageKey(serialNo));
    if (!raw) return null;
    if (!parsedCache.has(raw)) {
      parsedCache.set(raw, JSON.parse(raw) as SubmissionSummary);
    }
    return parsedCache.get(raw) ?? null;
  } catch {
    return null;
  }
}

/** No-op subscription for useSyncExternalStore: this value is written once
 * before navigation and never changes for the lifetime of the confirmation
 * page, so there is nothing to subscribe to. */
export function subscribeToNothing() {
  return () => {};
}

export function getServerSnapshot() {
  return null;
}
