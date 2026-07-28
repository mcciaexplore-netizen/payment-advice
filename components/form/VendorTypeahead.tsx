"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/Input";

export type VendorSearchResult = {
  id: string;
  companyName: string;
  contactPerson: string | null;
  contactPhone: string | null;
  address: string | null;
  email: string | null;
  gstin: string | null;
  udyamNumber: string | null;
};

export function VendorTypeahead({
  id,
  value,
  onChange,
  onSelectVendor,
  hasError,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onSelectVendor: (vendor: VendorSearchResult) => void;
  hasError?: boolean;
}) {
  const [results, setResults] = useState<VendorSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const trimmedValue = value.trim();
  const queryTooShort = trimmedValue.length < 2;
  const visibleResults = queryTooShort ? [] : results;
  const loading = !queryTooShort && trimmedValue !== debouncedQuery;

  // Debounce: only commit the query 250ms after typing stops.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(trimmedValue), 250);
    return () => clearTimeout(timer);
  }, [trimmedValue]);

  // Fetch whenever the debounced query changes.
  useEffect(() => {
    if (debouncedQuery.length < 2) return;
    let cancelled = false;
    fetch(`/api/vendors/search?q=${encodeURIComponent(debouncedQuery)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setResults(data.vendors);
        setOpen(true);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <Input
        id={id}
        hasError={hasError}
        value={value}
        autoComplete="off"
        placeholder="Start typing to search saved payees, or type a new name"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (visibleResults.length > 0) setOpen(true);
        }}
      />
      {open && !queryTooShort && (loading || visibleResults.length > 0) && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {loading ? (
            <div className="px-3 py-2 text-sm text-gray-500">Searching…</div>
          ) : (
            visibleResults.map((vendor) => (
              <button
                type="button"
                key={vendor.id}
                onClick={() => {
                  onSelectVendor(vendor);
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-[#0b1f3a]/5"
              >
                <div className="font-medium text-[#0b1f3a]">
                  {vendor.companyName}
                </div>
                {vendor.address ? (
                  <div className="truncate text-xs text-gray-500">
                    {vendor.address}
                  </div>
                ) : null}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
