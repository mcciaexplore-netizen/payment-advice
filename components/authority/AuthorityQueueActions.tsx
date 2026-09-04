"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AuthorityQueueActions({ adviceId }: { adviceId: string }) {
  const router = useRouter();
  const [showRemarks, setShowRemarks] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="flex min-w-48 flex-col gap-2">
      <div className="flex gap-2">
        <button onClick={() => act("approve")} disabled={busy} className="rounded bg-[#2e8b57] px-3 py-2 text-xs font-medium text-white disabled:opacity-50">Recommend</button>
        <button onClick={() => setShowRemarks((value) => !value)} disabled={busy} className="rounded border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 disabled:opacity-50">Send Back</button>
      </div>
      {showRemarks ? (
        <div className="flex flex-col gap-2">
          <textarea aria-label="Required remarks" placeholder="Required remarks" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} className="admin-filter-input text-sm" />
          <button onClick={() => act("reject")} disabled={busy || !remarks.trim()} className="rounded bg-[#0b1f3a] px-3 py-2 text-xs font-medium text-white disabled:opacity-50">Confirm Send Back</button>
        </div>
      ) : null}
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
