"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LogoutButton } from "@/components/admin/LogoutButton";

/** The account-menu dropdown shown in both the Finance Admin and Authority
 * headers — same component, different props, per the "shared component,
 * mode-driven" convention this codebase already uses elsewhere (e.g.
 * PaymentAdviceForm's `mode` prop). Both headers render this in place of
 * the plain name/role text + bare LogoutButton they used to show. */
export function AccountMenu({
  label,
  changePasswordHref,
  logoutEndpoint,
  loginPath,
}: {
  label: string;
  changePasswordHref: string;
  logoutEndpoint?: string;
  loginPath?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickAway(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1.5 text-white/80 hover:text-white"
      >
        <span>{label}</span>
        <svg
          viewBox="0 0 10 6"
          aria-hidden="true"
          className={`h-1.5 w-2.5 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-10 mt-2 w-48 overflow-hidden rounded-md border border-gray-200 bg-white py-1 text-sm text-gray-700 shadow-lg"
        >
          <Link
            href={changePasswordHref}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 hover:bg-gray-50"
          >
            Change Password
          </Link>
          <div className="border-t border-gray-100">
            <LogoutButton
              endpoint={logoutEndpoint}
              loginPath={loginPath}
              className="block w-full px-4 py-2 text-left hover:bg-gray-50"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
