"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Narrow "fix the name only" action for an already-Verified or already-
 * Sanctioned advice — NOT a general undo. Reuses the same fixed 4-/2-person
 * lists the original Verify/Sanction pickers use (VERIFIER_NAMES/
 * SANCTIONER_NAMES are still hardcoded, not a CRUD table — see
 * AGENT_HANDOFF.md). Does not touch verifiedAt/sanctionedAt.
 */
export function NameCorrectionAction({
  adviceId,
  kind,
  currentName,
  options,
}: {
  adviceId: string;
  kind: "verify" | "sanction";
  currentName: string;
  options: readonly string[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState(currentName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field = kind === "verify" ? "verifiedBy" : "sanctionedBy";

  async function save() {
    if (selected === currentName) {
      setEditing(false);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/advice/${adviceId}/${kind}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: selected }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setEditing(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setSelected(currentName);
          setError(null);
          setEditing(true);
        }}
        className="text-xs font-medium text-[#0b1f3a] hover:underline"
      >
        Correct name
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="admin-filter-input py-1 text-xs"
        disabled={submitting}
      >
        {options.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={save}
        disabled={submitting}
        className="text-xs font-medium text-[#0b1f3a] hover:underline disabled:opacity-50"
      >
        {submitting ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        onClick={() => {
          setEditing(false);
          setError(null);
        }}
        disabled={submitting}
        className="text-xs text-gray-500 hover:underline"
      >
        Cancel
      </button>
      {error ? <span className="text-xs font-medium text-[#b3261e]">{error}</span> : null}
    </span>
  );
}
