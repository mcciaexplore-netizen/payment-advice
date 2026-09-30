"use client";

import { useRouter } from "next/navigation";

/**
 * Real browser-history back navigation (not a hardcoded href) — this is
 * what actually preserves whatever tab/filter/page state the list view was
 * in when Admin drilled into a sub-page, with no state to serialize/pass
 * around. Falls back to a known-good URL only when there's nothing to go
 * back to (e.g. this page was opened directly / in a new tab), detected via
 * history length rather than assumed.
 *
 * `className` defaults to the original plain-text-link look (every existing
 * top-of-page usage keeps that exact appearance unchanged). A second
 * instance placed lower on a page — e.g. at the bottom of an action panel,
 * so reviewers don't have to scroll back up — can pass a boxed/bordered
 * button className instead to match that panel's own button conventions,
 * while sharing this exact same navigation behavior (so both instances on
 * a page always go to the identical place).
 */
export function BackLink({
  label,
  fallbackHref,
  className = "w-fit text-sm font-medium text-gray-600 hover:text-[#0b1f3a]",
}: {
  label: string;
  fallbackHref: string;
  className?: string;
}) {
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
      className={className}
    >
      ← {label}
    </button>
  );
}
