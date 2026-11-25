"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Decision = "RECOMMEND" | "SEND_BACK" | "REJECT";

/** The recommending authority's three choices on one third party refund:
 * Recommend, Send back (the submitter corrects and resubmits the same
 * request) or Reject (final). Send back and Reject need a reason and a second
 * "Confirm" click, as on a Payment Advice. The page refreshes afterwards and
 * shows the recorded decision instead of these buttons. `compact` is the
 * smaller version for a row of the Refund Requests list. */
export function RefundDecisionActions({ refundId, compact = false }: { refundId: string; compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState<"SEND_BACK" | "REJECT" | null>(null);
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: Decision) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/authority/refund/${refundId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(decision === "RECOMMEND" ? { decision } : { decision, remarks }),
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

  const size = compact ? "px-3 py-1.5 text-xs" : "px-5 py-2 text-sm";
  const toggle = (next: "SEND_BACK" | "REJECT") => { setOpen((current) => (current === next ? null : next)); setError(null); };
  const rejecting = open === "REJECT";

  return (
    <div className={`flex flex-col gap-2 ${compact ? "max-w-xs" : "max-w-xl"}`}>
      {error ? <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => decide("RECOMMEND")} className={`rounded-md bg-[#2e8b57] font-medium text-white disabled:opacity-50 ${size}`}>
          {busy && !open ? "Saving..." : "Recommend"}
        </button>
        <button type="button" disabled={busy} aria-expanded={open === "SEND_BACK"} onClick={() => toggle("SEND_BACK")} className={`rounded-md border border-gray-300 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 ${size}`}>Send back</button>
        <button type="button" disabled={busy} aria-expanded={rejecting} onClick={() => toggle("REJECT")} className={`rounded-md border border-red-500 font-medium text-red-950 hover:bg-red-50 disabled:opacity-50 ${size}`}>Reject</button>
      </div>
      {open ? (
        <div className={`flex flex-col gap-2 rounded-md border p-3 ${rejecting ? "border-red-400 bg-red-50" : "border-gray-200 bg-white"}`}>
          <label htmlFor={`refund-reason-${refundId}`} className="text-sm font-medium text-[#0b1f3a]">
            {rejecting ? "Reason for rejecting (required)" : "Remarks for the submitter (required)"}
          </label>
          <textarea
            id={`refund-reason-${refundId}`}
            rows={3}
            maxLength={1000}
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
            placeholder={rejecting ? "Why is this request rejected?" : "What needs to be corrected?"}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          />
          <p className="text-xs text-gray-600">
            {rejecting
              ? "Rejecting is final: the request is closed, cannot be recommended or paid, and the submitter is emailed this reason."
              : "The submitter is emailed these remarks, corrects the same request and resubmits it to you. Its reference number does not change."}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || remarks.trim().length === 0} onClick={() => decide(open)} className={`rounded-md font-medium text-white disabled:opacity-50 ${size} ${rejecting ? "bg-red-900" : "bg-[#0b1f3a]"}`}>
              {busy ? "Saving..." : rejecting ? "Confirm Reject" : "Confirm Send back"}
            </button>
            <button type="button" disabled={busy} onClick={() => { setOpen(null); setError(null); }} className={`rounded-md border border-gray-300 font-medium text-gray-700 ${size}`}>Cancel</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
