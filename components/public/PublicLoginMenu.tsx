"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export function PublicLoginMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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
        Login
        <svg viewBox="0 0 10 6" aria-hidden="true" className={`h-1.5 w-2.5 transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <div role="menu" className="absolute right-0 top-full z-20 mt-2 w-64 overflow-hidden rounded-md border border-gray-200 bg-white py-1 shadow-lg">
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
            description="Review and approve assigned submissions"
            onSelect={() => setOpen(false)}
          />
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
