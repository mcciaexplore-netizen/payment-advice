"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/Input";

export type StaffAuthorityOption = { id: string; authorityName: string };
export type StaffSearchResult = {
  id: string;
  fullName: string;
  email: string | null;
  department: string | null;
  branch: string | null;
  authorityOptions: StaffAuthorityOption[];
};

export function StaffNameTypeahead({
  id,
  name,
  required,
  value,
  onChange,
  onMatch,
  hasError,
}: {
  id?: string;
  name?: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  /** Fired whenever the current value resolves to an active staff member —
   * either by clicking a suggestion, or by typing their full name exactly
   * (case-insensitive) without ever opening the dropdown. Fired with `null`
   * when the value no longer matches anyone. */
  onMatch: (staff: StaffSearchResult | null) => void;
  hasError?: boolean;
}) {
  const [results, setResults] = useState<StaffSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchError, setSearchError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const trimmedValue = value.trim();
  const queryTooShort = trimmedValue.length < 2;
  const visibleResults = queryTooShort ? [] : results;
  const loading = !queryTooShort && trimmedValue !== debouncedQuery;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(trimmedValue), 250);
    return () => clearTimeout(timer);
  }, [trimmedValue]);

  useEffect(() => {
    if (debouncedQuery.length < 2) return;
    let cancelled = false;
    fetch(`/api/staff/search?q=${encodeURIComponent(debouncedQuery)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Staff search failed with status ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setResults(data.staff);
      })
      .catch(() => {
        if (cancelled) return;
        setResults([]);
        setSearchError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  // Detect an exact match even when the submitter never opens the dropdown
  // (types the full name and moves on) — per spec, this counts the same as
  // an explicit selection.
  useEffect(() => {
    const exact = results.find(
      (r) => r.fullName.trim().toLowerCase() === trimmedValue.toLowerCase(),
    );
    onMatch(exact ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onMatch identity is not meant to retrigger this; only the value/results should.
  }, [results, trimmedValue]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
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
        name={name}
        required={required}
        hasError={hasError}
        value={value}
        autoComplete="off"
        placeholder="Start typing your name…"
        onChange={(e) => {
          setSearchError(false);
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (visibleResults.length > 0) setOpen(true);
        }}
      />
      {searchError && (
        <p role="alert" className="mt-1 text-sm text-[#b3261e]">
          Staff lookup is temporarily unavailable. Enter your department and branch manually.
        </p>
      )}
      {open && !queryTooShort && (loading || visibleResults.length > 0) && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {loading ? (
            <div className="px-3 py-2 text-sm text-gray-500">Searching…</div>
          ) : (
            visibleResults.map((staff) => (
              <button
                type="button"
                key={staff.id}
                onClick={() => {
                  onChange(staff.fullName);
                  onMatch(staff);
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-[#0b1f3a]/5"
              >
                <div className="font-medium text-[#0b1f3a]">{staff.fullName}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
