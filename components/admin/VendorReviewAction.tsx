"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  VendorTypeahead,
  type VendorSearchResult,
} from "@/components/form/VendorTypeahead";

type Mode = "link" | "create";

export function VendorReviewAction({
  adviceId,
  currentPayeeName,
  currentPayeeAddress,
}: {
  adviceId: string;
  currentPayeeName: string;
  currentPayeeAddress: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("link");
  const [vendorQuery, setVendorQuery] = useState("");
  const [selectedVendor, setSelectedVendor] = useState<VendorSearchResult | null>(null);
  const [companyName, setCompanyName] = useState(currentPayeeName);
  const [address, setAddress] = useState(currentPayeeAddress);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setSaving(true);
    try {
      const body = mode === "link"
        ? { action: "link", vendorId: selectedVendor?.id }
        : { action: "create", companyName, address };
      const response = await fetch(`/api/admin/vendor-review/${adviceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error ?? "Could not resolve this vendor. Please try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not resolve this vendor. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4">
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Vendor resolution method">
        <ModeButton active={mode === "link"} onClick={() => setMode("link")}>
          Link existing vendor
        </ModeButton>
        <ModeButton active={mode === "create"} onClick={() => setMode("create")}>
          Create new vendor
        </ModeButton>
      </div>

      {mode === "link" ? (
        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-[#0b1f3a]" htmlFor={`vendor-search-${adviceId}`}>
            Search canonical vendors
          </label>
          <VendorTypeahead
            id={`vendor-search-${adviceId}`}
            value={vendorQuery}
            onChange={setVendorQuery}
            onSelectVendor={(vendor) => {
              setSelectedVendor(vendor);
              setVendorQuery(vendor.companyName);
            }}
            onClearVendor={() => setSelectedVendor(null)}
          />
          {selectedVendor ? (
            <p className="text-xs text-[#1e5c39]">
              Selected: <span className="font-medium">{selectedVendor.companyName}</span>
              {selectedVendor.address ? ` · ${selectedVendor.address}` : ""}
            </p>
          ) : null}
          <p className="text-xs text-gray-600">
            The submission name will be rewritten to the vendor&apos;s exact canonical spelling.
            A canonical vendor address replaces the submission address only when one is on file.
          </p>
          <button
            type="button"
            onClick={submit}
            disabled={saving || !selectedVendor}
            className="w-fit rounded-md bg-[#0b1f3a] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Linking…" : "Link vendor"}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-[#0b1f3a]" htmlFor={`canonical-name-${adviceId}`}>
            Canonical vendor name <span className="text-[#b3261e]">Required</span>
          </label>
          <input
            id={`canonical-name-${adviceId}`}
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
            className="admin-filter-input"
          />
          <label className="text-sm font-medium text-[#0b1f3a]" htmlFor={`canonical-address-${adviceId}`}>
            Canonical address <span className="font-normal text-gray-500">Optional</span>
          </label>
          <textarea
            id={`canonical-address-${adviceId}`}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            rows={3}
            className="admin-filter-input"
          />
          <p className="text-xs text-gray-600">
            This creates an active vendor and immediately links this submission to it. Check the
            spelling carefully; an existing name must be linked instead of duplicated.
          </p>
          <button
            type="button"
            onClick={submit}
            disabled={saving || !companyName.trim()}
            className="w-fit rounded-md bg-[#2e8b57] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create and link vendor"}
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
