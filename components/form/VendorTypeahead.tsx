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
  onClearVendor,
  hasError,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onSelectVendor: (vendor: VendorSearchResult) => void;
  /** Called when the field's text diverges from the vendor that was last
   * selected (by click or exact-typed-match) — e.g. the person picks a
   * vendor, then keeps typing and changes the name. Without this, vendorId
   * would silently keep pointing at the old vendor while the displayed
   * text no longer matches it, defeating the point of requiring a real
   * selection at all. */
  onClearVendor: () => void;
  hasError?: boolean;
}) {
  const [results, setResults] = useState<VendorSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  // Only true once the person has actually typed in this field this
  // session — guards the exact-match effect below from firing on an
  // /edit/[token] resubmit's prefilled value (which can legitimately equal
  // an existing vendor's name already) the moment results happen to load.
  // Without this, mounting with a prefilled match would silently overwrite
  // the historical snapshot fields (payeeAddress, payeeGstin, etc.) with
  // the vendor's current live data — correct for a deliberate selection,
  // wrong for an untouched prefill.
  const hasTypedRef = useRef(false);
  // Name of the vendor last selected (by click or exact-typed-match), so a
  // further edit that moves the text away from it can clear the stale
  // vendorId rather than silently leaving it pointing at the wrong vendor.
  // Seeded from whatever text is present on mount (an /edit/[token] resubmit
  // prefill included) — if that prefill already carries a real vendorId, an
  // edit away from it should clear it exactly the same as a fresh selection
  // would; if it doesn't, there's no vendorId to clear either way.
  const selectedNameRef = useRef<string | null>(value.trim() || null);

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

  // Detect an exact match even when the submitter never opens/clicks the
  // dropdown (types the full company name and moves on) — mirrors
  // StaffNameTypeahead's identical "typing the exact name counts the same
  // as clicking it" behavior, so vendor matching works the same way staff
  // and authority matching already do.
  useEffect(() => {
    if (!hasTypedRef.current) return;
    const exact = results.find(
      (r) => r.companyName.trim().toLowerCase() === trimmedValue.toLowerCase(),
    );
    if (exact) {
      selectedNameRef.current = exact.companyName;
      onSelectVendor(exact);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onSelectVendor identity is not meant to retrigger this; only the value/results should.
  }, [results, trimmedValue]);

  // If the text moves away from whichever vendor was last selected (typed
  // further, edited, deleted), the previous selection no longer applies —
  // clear it instead of leaving a stale vendorId pointing at mismatched text.
  useEffect(() => {
    if (!hasTypedRef.current || selectedNameRef.current === null) return;
    if (trimmedValue.toLowerCase() !== selectedNameRef.current.toLowerCase()) {
      selectedNameRef.current = null;
      onClearVendor();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onClearVendor identity is not meant to retrigger this; only the value should.
  }, [trimmedValue]);

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
        placeholder="Start typing to search saved payees"
        onChange={(e) => {
          hasTypedRef.current = true;
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (visibleResults.length > 0) setOpen(true);
        }}
      />
      {open && !queryTooShort && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {loading ? (
            <div className="px-3 py-2 text-sm text-gray-500">Searching…</div>
          ) : visibleResults.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-600">
              Can&apos;t find this vendor? Contact Accounts department for listing.
            </div>
          ) : (
            visibleResults.map((vendor) => (
              <button
                type="button"
                key={vendor.id}
                onClick={() => {
                  selectedNameRef.current = vendor.companyName;
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
