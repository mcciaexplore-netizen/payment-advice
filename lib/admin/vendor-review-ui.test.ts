import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Vendor Review Queue UI", () => {
  const page = fs.readFileSync(
    path.join(process.cwd(), "app/admin/vendor-review/page.tsx"),
    "utf8",
  );
  const action = fs.readFileSync(
    path.join(process.cwd(), "components/admin/VendorReviewAction.tsx"),
    "utf8",
  );
  const dashboard = fs.readFileSync(path.join(process.cwd(), "app/admin/page.tsx"), "utf8");
  const layout = fs.readFileSync(path.join(process.cwd(), "app/admin/layout.tsx"), "utf8");

  it("queues only unlinked regular NEFT submissions", () => {
    expect(page).toContain('eq(paymentAdvices.paymentMode, "NEFT")');
    expect(page).toContain("eq(paymentAdvices.isAdvance, false)");
    expect(page).toContain("isNull(paymentAdvices.vendorId)");
  });

  it("offers both approved Finance resolution paths", () => {
    expect(action).toContain("Link existing vendor");
    expect(action).toContain("Create new vendor");
    expect(action).toContain("Create and link vendor");
  });

  it("is linked from both the Finance dashboard and navigation", () => {
    expect(dashboard).toContain('href="/admin/vendor-review"');
    expect(layout).toContain('href="/admin/vendor-review"');
  });
});
