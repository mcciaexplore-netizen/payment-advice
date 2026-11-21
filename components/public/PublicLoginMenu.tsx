"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LogoutButton } from "@/components/admin/LogoutButton";
import type { DeskDashboardLink } from "@/lib/desk-dashboards";

type SessionInfo = { signedIn: false } | { signedIn: true; fullName: string; dashboards: DeskDashboardLink[] };

export function PublicLoginMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // Who is signed in (from the Payment Desk sign-in or any dashboard login).
  // Signed in: the menu lists only that account's dashboards, linked past
  // their login pages. Until it loads, or when signed out: the login pages.
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/session", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: SessionInfo | null) => { if (!cancelled && data) setSessionInfo(data); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  const signedIn = sessionInfo?.signedIn ? sessionInfo : null;

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <div ref={rootRef} className="relative ml-auto shrink-0 sm:absolute sm:right-0 sm:top-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-md border border-[#0b1f3a] px-4 py-2 text-sm font-medium text-[#0b1f3a] hover:bg-[#0b1f3a]/5"
      >
        {signedIn ? "Dashboards" : "Login"}
        <svg viewBox="0 0 10 6" aria-hidden="true" className={`h-1.5 w-2.5 transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <div role="menu" className="absolute right-0 top-full z-20 mt-2 w-64 overflow-hidden rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          {signedIn ? <>
            <p className="px-4 pb-2 pt-3 text-xs text-gray-500">Signed in as <span className="font-medium text-[#0b1f3a]">{signedIn.fullName}</span></p>
            {signedIn.dashboards.length === 0 ? <p className="border-t border-gray-100 px-4 py-3 text-xs text-gray-500">Your account has no dashboard access.</p> : null}
            {signedIn.dashboards.map((dashboard) => <div key={dashboard.href}>
              <div className="border-t border-gray-100" />
              <LoginOption href={dashboard.href} title={dashboard.title} description={dashboard.description} onSelect={() => setOpen(false)} />
            </div>)}
            <div className="border-t border-gray-100" />
            <LogoutButton endpoint="/api/logout" loginPath="/login" className="block w-full px-4 py-3 text-left text-sm font-medium text-[#b3261e] hover:bg-gray-50" />
          </> : <>
            <LoginOption
              href="/admin/login"
              title="Finance Admin Login"
              description="Dashboard, submissions and finance processing"
              onSelect={() => setOpen(false)}
            />
            <div className="border-t border-gray-100" />
            <LoginOption
              href="/authority/login"
              title="Authority Login"
              description="Review and recommend assigned submissions"
              onSelect={() => setOpen(false)}
            />
            <div className="border-t border-gray-100" />
            <LoginOption
              href="/team/login"
              title="Team Dashboard Login"
              description="Track your own and your team's submissions"
              onSelect={() => setOpen(false)}
            />
          </>}
        </div>
      ) : null}
    </div>
  );
}

function LoginOption({
  href,
  title,
  description,
  onSelect,
}: {
  href: string;
  title: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <Link href={href} role="menuitem" onClick={onSelect} className="block px-4 py-3 hover:bg-gray-50">
      <span className="block text-sm font-medium text-[#0b1f3a]">{title}</span>
      <span className="mt-0.5 block text-xs text-gray-500">{description}</span>
    </Link>
  );
}
