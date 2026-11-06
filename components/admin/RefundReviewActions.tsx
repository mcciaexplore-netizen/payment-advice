"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Action = "SEND_BACK" | "CANCEL";

const COPY: Record<Action, { button: string; title: string; hint: string; confirm: string }> = {
  SEND_BACK: {
    button: "Send back",
    title: "Send back to submitter",
    hint: "The submitter is emailed these remarks and files a corrected request.",
    confirm: "Send back",
  },
  CANCEL: {
    button: "Cancel",
    title: "Cancel this request",
    hint: "The request stays on file as cancelled. Remarks are required.",
    confirm: "Cancel request",
  },
};

/** Finance's Send back / Cancel for one Refund request row. Both need
 * remarks, so each opens a small inline form instead of a bare confirm. */
export function RefundReviewActions({ id }: { id: string }) {
  const router = useRouter();
  const [action, setAction] = useState<Action | null>(null);
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!action) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/refund/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, remarks }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setAction(null);
      setRemarks("");
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!action) {
    return (
      <div className="flex items-center gap-2">
        {(["SEND_BACK", "CANCEL"] as const).map((next) => (
          <button
            key={next}
            type="button"
            onClick={() => setAction(next)}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium ${next === "CANCEL" ? "border-[#b3261e]/40 text-[#b3261e] hover:bg-[#b3261e]/5" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}
          >
            {COPY[next].button}
          </button>
        ))}
      </div>
    );
  }

  const copy = COPY[action];
  return (
    <div className="flex w-64 flex-col gap-2 whitespace-normal">
      <p className="text-xs font-medium text-[#0b1f3a]">{copy.title}</p>
      <p className="text-xs text-gray-500">{copy.hint}</p>
      <textarea
        rows={3}
        value={remarks}
        onChange={(event) => setRemarks(event.target.value)}
        placeholder="Remarks (required)"
        className="rounded-md border border-gray-300 px-2 py-1.5 text-xs"
      />
      {error ? <p className="text-xs text-[#b3261e]">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || remarks.trim().length === 0}
          onClick={submit}
          className="rounded-md bg-[#0b1f3a] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : copy.confirm}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => { setAction(null); setRemarks(""); setError(null); }}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700"
        >
          Back
        </button>
      </div>
    </div>
  );
}
