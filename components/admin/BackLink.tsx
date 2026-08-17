"use client";

import { useRouter } from "next/navigation";

/**
 * Real browser-history back navigation (not a hardcoded href) — this is
 * what actually preserves whatever tab/filter/page state the list view was
 * in when Admin drilled into a sub-page, with no state to serialize/pass
 * around. Falls back to a known-good URL only when there's nothing to go
 * back to (e.g. this page was opened directly / in a new tab), detected via
 * history length rather than assumed.
 */
export function BackLink({ label, fallbackHref }: { label: string; fallbackHref: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) {
          router.back();
        } else {
          router.push(fallbackHref);
        }
      }}
      className="w-fit text-sm font-medium text-gray-600 hover:text-[#0b1f3a]"
    >
      ← {label}
    </button>
  );
}
