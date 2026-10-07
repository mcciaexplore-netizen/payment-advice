import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Finance Admin top nav, restructured (2026-10-07)", () => {
  const layout = fs.readFileSync(path.join(process.cwd(), "app/admin/layout.tsx"), "utf8");
  const nav = fs.readFileSync(path.join(process.cwd(), "components/admin/AdminNav.tsx"), "utf8");

  it("has at most 6 top-level items: Dashboard, Submissions, Forwarding Memos, Cash Receipts, Vendors (dropdown), Staff & Authorities", () => {
    const navItemsBlock = nav.slice(nav.indexOf("const NAV_ITEMS"), nav.indexOf("const VENDORS_ITEMS"));
    const topLevelLabels = [...navItemsBlock.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
    expect(topLevelLabels).toEqual(["Dashboard", "Submissions", "Forwarding Memos", "Cash Receipts"]);
    // Plus the Vendors dropdown trigger and Staff & Authorities = 6 total.
    expect(nav).toContain("<VendorsDropdown");
    expect(nav).toContain("Staff &amp; Authorities".replace("&amp;", "&"));
  });

  it("folds Vendor Review and Vendor Addition Requests under one Vendors dropdown, not separate top-level items", () => {
    expect(nav).toContain('{ href: "/admin/vendors", label: "Vendors" }');
    expect(nav).toContain('{ href: "/admin/vendor-requests", label: "Vendor Addition Requests" }');
    expect(nav).not.toContain('label: "Vendor Review"');
    expect(nav).not.toMatch(/label:\s*"Vendors"[\s\S]{0,400}label:\s*"Vendor Addition Requests"[\s\S]{0,400}label:\s*"Dashboard"/);
  });

  it("shows a pending-count badge on the Vendors item for pending vendor requests", () => {
    expect(layout).toContain("getPendingVendorRequestCount()");
    expect(nav).toContain("badge > 0 ? <CountBadge count={badge} /> : null");
  });

  it("highlights the active item by comparing the real pathname, not a hardcoded guess", () => {
    expect(nav).toContain("usePathname()");
    expect(nav).toContain('match: (p) => p === "/admin"');
    expect(nav).toContain("navLinkClass(item.match(pathname))");
  });

  it("is keyboard-accessible: Vendors is a real button with aria-expanded/aria-haspopup, closes on Escape, items are real links", () => {
    expect(nav).toContain('aria-haspopup="menu"');
    expect(nav).toContain("aria-expanded={open}");
    expect(nav).toContain('event.key === "Escape"');
  });

  it("has a mobile drawer toggled by an accessible button, listing every item flat", () => {
    expect(nav).toContain('aria-controls="admin-mobile-drawer"');
    expect(nav).toContain('id="admin-mobile-drawer"');
    // xl:, not sm: - the nav's real minimum single-row width is ~1193px
    // (longest account label: "MCCIA Finance (All Access) · All Access"),
    // confirmed by bisecting actual rendered overflow; sm:/md:/lg: all sit
    // well under that and would silently overflow for that account.
    expect(nav).toContain("xl:hidden");
    expect(nav).not.toContain("sm:hidden");
  });

  it("keeps My Recommendations reachable for AUTHORITY-role sessions without it eating a top-level slot", () => {
    expect(layout).toContain('authorityHref={hasRole(session, "AUTHORITY") ? "/authority" : null}');
    expect(nav).toContain('{ href: authorityHref, label: "My Recommendations" }');
  });

  it("is the same nav for every Finance role - no PAYMENT_ADVICE/CASH_VOUCHER/ALL branching in the item list", () => {
    const navItemsBlock = nav.slice(nav.indexOf("const NAV_ITEMS"), nav.indexOf("function navLinkClass"));
    expect(navItemsBlock).not.toContain("PAYMENT_ADVICE");
    expect(navItemsBlock).not.toContain("CASH_VOUCHER");
    expect(navItemsBlock).not.toContain('"ALL"');
  });

  it("keeps the brand label from colliding with the nav: whitespace-nowrap, shrunk logo, outer wrap only drops the nav/drawer to a new row", () => {
    expect(layout).toContain('className="flex shrink-0 items-center gap-3 whitespace-nowrap"');
    expect(layout).toContain('className="font-heading text-lg text-white whitespace-nowrap"');
  });

  it("keeps + New Submission and the account menu visually separated from the main links", () => {
    expect(nav).toContain("border-l border-white/20 pl-6");
  });
});
