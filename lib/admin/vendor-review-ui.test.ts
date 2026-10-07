import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Vendor Review, merged into Vendor Addition Requests as a tab (2026-10-07)", () => {
  const page = fs.readFileSync(
    path.join(process.cwd(), "app/admin/vendor-requests/page.tsx"),
    "utf8",
  );
  const redirectPage = fs.readFileSync(
    path.join(process.cwd(), "app/admin/vendor-review/page.tsx"),
    "utf8",
  );
  const action = fs.readFileSync(
    path.join(process.cwd(), "components/admin/VendorReviewAction.tsx"),
    "utf8",
  );
  const dashboard = fs.readFileSync(path.join(process.cwd(), "app/admin/page.tsx"), "utf8");

  it("the old /admin/vendor-review URL redirects to the merged page's review tab, not a 404", () => {
    expect(redirectPage).toContain('redirect("/admin/vendor-requests?tab=review")');
  });

  it("queues only unlinked regular NEFT submissions in the Historical Review tab, same predicate as before", () => {
    expect(page).toContain('eq(paymentAdvices.paymentMode, "NEFT")');
    expect(page).toContain("eq(paymentAdvices.isAdvance, false)");
    expect(page).toContain("isNull(paymentAdvices.vendorId)");
  });

  it("offers both approved Finance resolution paths in the Historical Review tab, unchanged", () => {
    expect(action).toContain("Link existing vendor");
    expect(action).toContain("Create new vendor");
    expect(action).toContain("Create and link vendor");
  });

  it("has two tabs on one page, New Requests default and Historical Review via ?tab=review", () => {
    expect(page).toContain('href="/admin/vendor-requests"');
    expect(page).toContain('href="/admin/vendor-requests?tab=review"');
    expect(page).toContain('sp.tab === "review" ? "review" : "requests"');
  });

  it("the Finance dashboard links its Vendor Review card straight to the review tab", () => {
    expect(dashboard).toContain('href="/admin/vendor-requests?tab=review"');
  });
});
