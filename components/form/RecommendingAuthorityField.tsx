"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/Input";
import { StaffSearchResult } from "@/components/form/StaffNameTypeahead";

export type AuthorityOption = { id: string; authorityName: string };

/** Free-text entry with lightweight client-side suggestions, used both for
 * "Other" (matched staff, non-default authority) and for an unmatched
 * submitter name. The authority list is small (~15-20 rows, already loaded
 * by the page), so this filters in-memory rather than hitting an API. Only
 * ever resolves to a real recommending_authorities.id — an unmatched typed
 * value clears the id entirely, which the existing required-UUID
 * validation already rejects at submit time, so there is no separate
 * "unknown authority" error path to build. */
function FreeTextAuthorityInput({
  allAuthorities,
  text,
  onTextChange,
  onResolve,
  hasError,
}: {
  allAuthorities: AuthorityOption[];
  text: string;
  onTextChange: (text: string) => void;
  onResolve: (id: string) => void;
  hasError?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const match = allAuthorities.find(
      (a) => a.authorityName.trim().toLowerCase() === text.trim().toLowerCase(),
    );
    onResolve(match?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onResolve identity shouldn't retrigger this.
  }, [text, allAuthorities]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const suggestions =
    text.trim().length < 1
      ? []
      : allAuthorities.filter((a) => a.authorityName.toLowerCase().includes(text.trim().toLowerCase())).slice(0, 8);

  return (
    <div ref={containerRef} className="relative">
      <Input
        hasError={hasError}
        value={text}
        autoComplete="off"
        placeholder="Type the recommending authority's name"
        onChange={(e) => {
          onTextChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {suggestions.map((a) => (
            <button
              type="button"
              key={a.id}
              onClick={() => {
                onTextChange(a.authorityName);
                onResolve(a.id);
                setOpen(false);
              }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-[#0b1f3a]/5"
            >
              {a.authorityName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function RecommendingAuthorityField({
  matchedStaff,
  allAuthorities,
  value,
  onChange,
  hasError,
}: {
  matchedStaff: StaffSearchResult | null;
  allAuthorities: AuthorityOption[];
  value: string;
  onChange: (id: string) => void;
  hasError?: boolean;
}) {
  const options = matchedStaff?.authorityOptions ?? [];
  const hasMatch = matchedStaff !== null && options.length > 0;

  const [mode, setMode] = useState<"option1" | "option2" | "other">("other");
  const [otherText, setOtherText] = useState("");
  const lastStaffId = useRef<string | null>(null);
  // Read via ref (not a reactive dependency) so the effect below only fires
  // on staff-identity changes, not on every value change this component's
  // own onChange calls cause. Updated in its own effect (not during render)
  // and declared first so it commits before the effect that reads it.
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // Re-derive the selection whenever the matched staff member actually
  // changes (not on every keystroke/re-render). On the very first match for
  // a given staff id, prefer reverse-deriving from an already-set `value`
  // (the /edit/[token] resubmit flow prefills recommendingAuthorityId from
  // the original submission) over the fresh-submission default — otherwise
  // resubmitting would silently overwrite a previously chosen authority.
  useEffect(() => {
    const staffId = matchedStaff?.id ?? null;
    if (staffId === lastStaffId.current) return;
    lastStaffId.current = staffId;

    const incoming = valueRef.current;

    if (!hasMatch) {
      if (incoming) {
        const existing = allAuthorities.find((a) => a.id === incoming);
        setMode("other");
        setOtherText(existing?.authorityName ?? "");
        return;
      }
      setMode("other");
      setOtherText("");
      onChange("");
      return;
    }

    if (incoming) {
      const matchedOptionIndex = options.findIndex((o) => o.id === incoming);
      if (matchedOptionIndex === 0) {
        setMode("option1");
        return;
      }
      if (matchedOptionIndex === 1) {
        setMode("option2");
        return;
      }
      const existing = allAuthorities.find((a) => a.id === incoming);
      setMode("other");
      setOtherText(existing?.authorityName ?? "");
      return;
    }

    if (options.length === 1) {
      setMode("option1");
      onChange(options[0].id);
    } else {
      setMode("other");
      setOtherText("");
      onChange("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the staff identity should retrigger this, not onChange/options/allAuthorities identity.
  }, [hasMatch, matchedStaff?.id]);

  function selectMode(next: "option1" | "option2" | "other") {
    setMode(next);
    if (next === "option1") onChange(options[0].id);
    else if (next === "option2") onChange(options[1].id);
    else {
      setOtherText("");
      onChange("");
    }
  }

  if (!hasMatch) {
    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-xs text-gray-500">
          We couldn&apos;t find your name in the staff list — type the name of your
          recommending authority below.
        </p>
        <FreeTextAuthorityInput
          allAuthorities={allAuthorities}
          text={otherText}
          onTextChange={setOtherText}
          onResolve={onChange}
          hasError={hasError}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-4">
        {options.map((opt, i) => (
          <label key={opt.id} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={mode === (i === 0 ? "option1" : "option2")}
              onChange={() => selectMode(i === 0 ? "option1" : "option2")}
            />
            {opt.authorityName}
          </label>
        ))}
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" checked={mode === "other"} onChange={() => selectMode("other")} />
          Other
        </label>
      </div>
      {mode === "other" ? (
        <FreeTextAuthorityInput
          allAuthorities={allAuthorities}
          text={otherText}
          onTextChange={setOtherText}
          onResolve={onChange}
          hasError={hasError}
        />
      ) : null}
    </div>
  );
}
