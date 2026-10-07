"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AccountMenu } from "@/components/account/AccountMenu";
import { NewSubmissionLink } from "@/components/account/NewSubmissionLink";

type NavItem = { href: string; label: string; match: (pathname: string) => boolean };

const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "Dashboard", match: (p) => p === "/admin" },
  {
    href: "/admin/submissions",
    label: "Submissions",
    match: (p) => p.startsWith("/admin/submissions") || p.startsWith("/admin/advice/"),
  },
  {
    href: "/admin/forwarding-memos",
    label: "Forwarding Memos",
    match: (p) => p.startsWith("/admin/forwarding-memos"),
  },
  {
    href: "/admin/cash-receipts",
    label: "Cash Receipts",
    match: (p) => p.startsWith("/admin/cash-receipts"),
  },
];

const VENDORS_ITEMS = [
  { href: "/admin/vendors", label: "Vendors" },
  { href: "/admin/vendor-requests", label: "Vendor Addition Requests" },
];

const VENDORS_GROUP_MATCH = (p: string) =>
  p.startsWith("/admin/vendors") || p.startsWith("/admin/vendor-requests") || p.startsWith("/admin/vendor-review");

const STAFF_ITEM: NavItem = {
  href: "/admin/staff",
  label: "Staff & Authorities",
  match: (p) => p.startsWith("/admin/staff"),
};

function navLinkClass(active: boolean): string {
  return `whitespace-nowrap border-b-2 py-0.5 text-sm font-medium transition-colors ${
    active
      ? "border-[#e8a33d] text-white"
      : "border-transparent text-white/80 hover:text-white"
  }`;
}

export function AdminNav({
  roleLabel,
  changePasswordHref,
  authorityHref,
  pendingVendorRequestCount,
}: {
  roleLabel: string;
  changePasswordHref: string;
  authorityHref: string | null;
  pendingVendorRequestCount: number;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const extraLinks = authorityHref ? [{ href: authorityHref, label: "My Recommendations" }] : undefined;

  return (
    <>
      <nav className="hidden items-center gap-x-6 gap-y-2 text-sm text-white/80 xl:flex">
        {NAV_ITEMS.map((item) => (
          <Link key={item.href} href={item.href} className={navLinkClass(item.match(pathname))}>
            {item.label}
          </Link>
        ))}
        <VendorsDropdown active={VENDORS_GROUP_MATCH(pathname)} badge={pendingVendorRequestCount} />
        <Link href={STAFF_ITEM.href} className={navLinkClass(STAFF_ITEM.match(pathname))}>
          {STAFF_ITEM.label}
        </Link>
        <div className="flex items-center gap-5 whitespace-nowrap border-l border-white/20 pl-6">
          <NewSubmissionLink />
          <AccountMenu label={roleLabel} changePasswordHref={changePasswordHref} extraLinks={extraLinks} />
        </div>
      </nav>

      <div className="flex items-center gap-4 xl:hidden">
        <AccountMenu label={roleLabel} changePasswordHref={changePasswordHref} extraLinks={extraLinks} />
        <button
          type="button"
          aria-expanded={drawerOpen}
          aria-controls="admin-mobile-drawer"
          aria-label={drawerOpen ? "Close menu" : "Open menu"}
          onClick={() => setDrawerOpen((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-white/30 text-white"
        >
          <svg viewBox="0 0 20 16" aria-hidden="true" className="h-4 w-4">
            {drawerOpen ? (
              <path d="M1 1l18 14M19 1L1 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
            ) : (
              <path d="M0 1h20M0 8h20M0 15h20" stroke="currentColor" strokeWidth="2" fill="none" />
            )}
          </svg>
        </button>
      </div>

      {drawerOpen ? (
        <div id="admin-mobile-drawer" className="w-full border-t border-white/10 pt-3 xl:hidden">
          <div className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <DrawerLink key={item.href} href={item.href} active={item.match(pathname)} onNavigate={() => setDrawerOpen(false)}>
                {item.label}
              </DrawerLink>
            ))}
            {VENDORS_ITEMS.map((item) => (
              <DrawerLink
                key={item.href}
                href={item.href}
                active={pathname.startsWith(item.href)}
                onNavigate={() => setDrawerOpen(false)}
              >
                {item.label}
                {item.href === "/admin/vendor-requests" && pendingVendorRequestCount > 0 ? (
                  <CountBadge count={pendingVendorRequestCount} />
                ) : null}
              </DrawerLink>
            ))}
            <DrawerLink href={STAFF_ITEM.href} active={STAFF_ITEM.match(pathname)} onNavigate={() => setDrawerOpen(false)}>
              {STAFF_ITEM.label}
            </DrawerLink>
            {authorityHref ? (
              <DrawerLink href={authorityHref} active={pathname.startsWith(authorityHref)} onNavigate={() => setDrawerOpen(false)}>
                My Recommendations
              </DrawerLink>
            ) : null}
          </div>
          <div className="mt-3 border-t border-white/10 pt-3">
            <Link
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-md px-2 py-2 text-sm font-medium text-white/80 hover:bg-white/5 hover:text-white"
            >
              + New Submission
            </Link>
          </div>
        </div>
      ) : null}
    </>
  );
}

function DrawerLink({
  href,
  active,
  onNavigate,
  children,
}: {
  href: string;
  active: boolean;
  onNavigate: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`flex items-center justify-between rounded-md px-2 py-2 text-sm font-medium ${
        active ? "bg-white/10 text-white" : "text-white/80 hover:bg-white/5 hover:text-white"
      }`}
    >
      {children}
    </Link>
  );
}

function CountBadge({ count }: { count: number }) {
  return (
    <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#e8a33d] px-1.5 text-xs font-semibold text-[#0b1f3a]">
      {count}
    </span>
  );
}

function VendorsDropdown({ active, badge }: { active: boolean; badge: number }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickAway(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickAway);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`flex items-center gap-1.5 ${navLinkClass(active)}`}
      >
        <span>Vendors</span>
        {badge > 0 ? <CountBadge count={badge} /> : null}
        <svg viewBox="0 0 10 6" aria-hidden="true" className={`h-1.5 w-2.5 transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute left-0 top-full z-10 mt-2 w-56 overflow-hidden rounded-md border border-gray-200 bg-white py-1 text-sm text-gray-700 shadow-lg"
        >
          {VENDORS_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between px-4 py-2 hover:bg-gray-50"
            >
              <span>{item.label}</span>
              {item.href === "/admin/vendor-requests" && badge > 0 ? <CountBadge count={badge} /> : null}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
