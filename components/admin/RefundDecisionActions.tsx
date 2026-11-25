"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** The recommending authority's two choices on one refund: recommend it, or
 * send it back with remarks (required). The page refreshes afterwards and
 * shows the recorded decision instead of these buttons. */
export function RefundDecisionActions({ refundId }: { refundId: string }) {
  const router = useRouter();
  const [sendingBack, setSendingBack] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "RECOMMEND" | "SEND_BACK") {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/authority/refund/${refundId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(decision === "SEND_BACK" ? { decision, remarks } : { decision }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex max-w-xl flex-col gap-3">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}
      {sendingBack ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="refund-remarks" className="text-sm font-medium text-[#0b1f3a]">Remarks for the submitter (required)</label>
          <textarea
            id="refund-remarks"
            rows={3}
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
            placeholder="What needs to be corrected?"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <p className="text-xs text-gray-500">The submitter is emailed these remarks and files a new third party refund request with the corrections.</p>
          <div className="flex gap-2">
            <button type="button" disabled={busy || remarks.trim().length === 0} onClick={() => decide("SEND_BACK")} className="rounded-md bg-[#b3261e] px-5 py-2 text-sm font-medium text-white disabled:opacity-50">
              {busy ? "Saving…" : "Send back"}
            </button>
            <button type="button" disabled={busy} onClick={() => { setSendingBack(false); setError(null); }} className="rounded-md border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => decide("RECOMMEND")} className="rounded-md bg-[#2e8b57] px-5 py-2 text-sm font-medium text-white disabled:opacity-50">
            {busy ? "Saving…" : "Recommend"}
          </button>
          <button type="button" disabled={busy} onClick={() => setSendingBack(true)} className="rounded-md border border-[#b3261e]/40 px-5 py-2 text-sm font-medium text-[#b3261e] hover:bg-[#b3261e]/5">Send back</button>
        </div>
      )}
    </div>
  );
}
