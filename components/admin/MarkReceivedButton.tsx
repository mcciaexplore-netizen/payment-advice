"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function MarkReceivedButton({ forwardingMemoId }: { forwardingMemoId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function markReceived() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/forwarding-memo/${forwardingMemoId}/received`, {
        method: "POST",
      });
      const data = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setError(data?.error ?? "Could not mark this memo received.");
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
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={markReceived}
        disabled={busy}
        className="rounded-md bg-[#0b1f3a] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#0b1f3a]/90 disabled:opacity-50"
      >
        {busy ? "Marking…" : "Mark Received"}
      </button>
      {error ? <p className="text-xs font-medium text-[#b3261e]">{error}</p> : null}
    </div>
  );
}
