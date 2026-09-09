"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AuthorityQueueActions({ adviceId }: { adviceId: string }) {
  const router = useRouter();
  const [showRemarks, setShowRemarks] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFinalReject, setShowFinalReject] = useState(false);
  const [finalRemarks, setFinalRemarks] = useState("");

  async function act(action: "approve" | "reject") {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/authority/advice/${adviceId}/${action}`, {
        method: "POST",
        headers: action === "reject" ? { "Content-Type": "application/json" } : undefined,
        body: action === "reject" ? JSON.stringify({ remarks }) : undefined,
      });
      const data = await response.json();
      if (!response.ok) return setError(data.error ?? "Could not record this decision.");
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function finalReject() {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/authority/advice/${adviceId}/reject-final`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remarks: finalRemarks }),
      });
      const data = await response.json();
      if (!response.ok) return setError(data.error ?? "Could not reject this submission.");
      router.refresh();
    } catch { setError("Could not reach the server. Please try again."); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex min-w-48 flex-col gap-2">
      <div className="flex gap-2">
        <button onClick={() => act("approve")} disabled={busy} className="rounded bg-[#2e8b57] px-3 py-2 text-xs font-medium text-white disabled:opacity-50">Recommend</button>
        <button onClick={() => setShowRemarks((value) => !value)} disabled={busy} className="rounded border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 disabled:opacity-50">Send Back</button>
        <button onClick={() => setShowFinalReject((value) => !value)} disabled={busy} className="rounded border border-red-500 px-3 py-2 text-xs font-medium text-red-950 disabled:opacity-50">Reject</button>
      </div>
      {showRemarks ? (
        <div className="flex flex-col gap-2">
          <textarea aria-label="Required remarks" placeholder="Required remarks" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} className="admin-filter-input text-sm" />
          <button onClick={() => act("reject")} disabled={busy || !remarks.trim()} className="rounded bg-[#0b1f3a] px-3 py-2 text-xs font-medium text-white disabled:opacity-50">Confirm Send Back</button>
        </div>
      ) : null}
      {showFinalReject ? <div className="flex flex-col gap-2 rounded border border-red-400 bg-red-50 p-3">
        <p className="text-xs text-red-950">This permanently closes the submission. Its reference number will not be reused.</p>
        <textarea aria-label="Required rejection remarks" placeholder="Required rejection remarks" rows={2} value={finalRemarks} onChange={(e) => setFinalRemarks(e.target.value)} className="admin-filter-input text-sm" />
        <button onClick={finalReject} disabled={busy || !finalRemarks.trim()} className="rounded bg-red-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">Confirm Reject</button>
      </div> : null}
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
