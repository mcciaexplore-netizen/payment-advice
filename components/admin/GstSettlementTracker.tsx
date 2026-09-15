"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatIstDateTime } from "@/lib/date-time";

function money(value: string | number): string {
  return Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2 });
}

export function GstSettlementTracker({
  adviceId,
  gstAmount,
  gstSettled,
  gstSettledBy,
  gstSettledAt,
  canEdit,
}: {
  adviceId: string;
  gstAmount: string;
  gstSettled: boolean;
  gstSettledBy: string | null;
  gstSettledAt: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function markSettled() {
    if (gstSettled || !canEdit || saving) return;
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/advice/${adviceId}/gst-settlements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settled: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not record GST settlement.");
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-md border border-sky-300 bg-sky-50 p-4 text-sm">
      <div>
        <p className="font-medium text-[#0b1f3a]">Has the GST amount been settled?</p>
        <p className="mt-1 text-gray-600">Submitted GST Amount: ₹ {money(gstAmount)}</p>
      </div>

      <div className="flex flex-wrap gap-5">
        <label className="flex items-center gap-2 text-[#0b1f3a]">
          <input
            type="radio"
            name={`gst-settled-${adviceId}`}
            value="no"
            checked={!gstSettled}
            onChange={() => undefined}
            disabled={!canEdit || saving || gstSettled}
          />
          No
        </label>
        <label className="flex items-center gap-2 text-[#0b1f3a]">
          <input
            type="radio"
            name={`gst-settled-${adviceId}`}
            value="yes"
            checked={gstSettled}
            onChange={markSettled}
            disabled={!canEdit || saving || gstSettled}
          />
          {saving ? "Saving…" : "Yes"}
        </label>
      </div>

      {gstSettled ? (
        <p className="text-[#1e5c39]">
          Marked settled by <span className="font-medium">{gstSettledBy ?? "Unknown"}</span>
          {gstSettledAt ? ` on ${formatIstDateTime(gstSettledAt)}` : ""}.
        </p>
      ) : (
        <p className="text-gray-600">GST has not been marked as settled.</p>
      )}
      {error ? <p className="font-medium text-[#b3261e]">{error}</p> : null}
    </div>
  );
}
