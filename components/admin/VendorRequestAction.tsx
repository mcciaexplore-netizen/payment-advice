"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "approve" | "send-back";

export function VendorRequestAction({
  requestId,
  currentName,
  currentAddress,
  currentGstin,
  hasMsmeDocument,
  duplicates,
}: {
  requestId: string;
  currentName: string;
  currentAddress: string;
  currentGstin: string | null;
  hasMsmeDocument: boolean;
  duplicates: { companyName: string; score: number }[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("approve");
  const [companyName, setCompanyName] = useState(currentName);
  const [address, setAddress] = useState(currentAddress);
  const [gstin, setGstin] = useState(currentGstin ?? "");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    if (
      !hasMsmeDocument &&
      !window.confirm("This vendor has no MSME document attached. Approve anyway?")
    ) {
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/vendor-requests/${requestId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName, address, gstin: gstin || undefined }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error ?? "Could not approve this vendor request. Please try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not approve this vendor request. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function sendBack() {
    setError(null);
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/vendor-requests/${requestId}/send-back`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminRemarks: remarks }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error ?? "Could not send this request back. Please try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not send this request back. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4">
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Vendor request action">
        <ModeButton active={mode === "approve"} onClick={() => setMode("approve")}>
          Edit &amp; Approve
        </ModeButton>
        <ModeButton active={mode === "send-back"} onClick={() => setMode("send-back")}>
          Send Back
        </ModeButton>
      </div>

      {duplicates.length > 0 ? (
        <div className="mb-4 rounded-md border border-orange-300 bg-orange-50 px-3 py-2 text-sm text-orange-900">
          <p className="font-medium">Possible existing match - double-check before approving:</p>
          <ul className="mt-1 list-disc pl-5">
            {duplicates.map((d) => (
              <li key={d.companyName}>
                {d.companyName} ({Math.round(d.score * 100)}% similar)
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {mode === "approve" ? (
        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-[#0b1f3a]" htmlFor={`name-${requestId}`}>
            Vendor name <span className="text-[#b3261e]">Required</span>
          </label>
          <input
            id={`name-${requestId}`}
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
            className="admin-filter-input"
          />
          <label className="text-sm font-medium text-[#0b1f3a]" htmlFor={`address-${requestId}`}>
            Address <span className="text-[#b3261e]">Required</span>
          </label>
          <textarea
            id={`address-${requestId}`}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            rows={3}
            className="admin-filter-input"
          />
          <label className="text-sm font-medium text-[#0b1f3a]" htmlFor={`gstin-${requestId}`}>
            GSTIN <span className="font-normal text-gray-500">Optional</span>
          </label>
          <input
            id={`gstin-${requestId}`}
            value={gstin}
            onChange={(event) => setGstin(event.target.value)}
            className="admin-filter-input"
          />
          <p className="text-xs text-gray-600">
            This creates an active vendor from the (possibly corrected) details above, links this
            submission to it, and backfills its payee name/address to match.
          </p>
          <button
            type="button"
            onClick={approve}
            disabled={saving || !companyName.trim() || !address.trim()}
            className="w-fit rounded-md bg-[#2e8b57] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Approving…" : "Approve and create vendor"}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-[#0b1f3a]" htmlFor={`remarks-${requestId}`}>
            Remarks for the submitter <span className="text-[#b3261e]">Required</span>
          </label>
          <textarea
            id={`remarks-${requestId}`}
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
            rows={3}
            className="admin-filter-input"
            placeholder="Explain what needs fixing - e.g. an incomplete address or a name mismatch."
          />
          <p className="text-xs text-gray-600">
            Sends the linked Payment Advice back through the usual edit-link flow, so the submitter
            can correct both the vendor details and the rest of their submission in one go.
          </p>
          <button
            type="button"
            onClick={sendBack}
            disabled={saving || !remarks.trim()}
            className="w-fit rounded-md bg-[#b3261e] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Sending back…" : "Send back"}
          </button>
        </div>
      )}

      {error ? <p className="mt-3 text-sm font-medium text-[#b3261e]">{error}</p> : null}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-md border px-3 py-2 text-sm font-medium ${
        active
          ? "border-[#0b1f3a] bg-[#0b1f3a] text-white"
          : "border-gray-300 bg-white text-[#0b1f3a] hover:bg-gray-100"
      }`}
    >
      {children}
    </button>
  );
}
