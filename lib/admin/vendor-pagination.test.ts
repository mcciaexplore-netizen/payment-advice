import { describe, expect, it } from "vitest";
import { vendorPageHref } from "./vendor-pagination";

describe("vendorPageHref", () => {
  it("links to the requested vendor page", () => {
    expect(vendorPageHref(2, "")).toBe("/admin/vendors?page=2");
  });

  it("preserves and safely encodes the vendor search", () => {
    expect(vendorPageHref(3, "  A & B  ")).toBe("/admin/vendors?q=A+%26+B&page=3");
  });

  it("never produces a page below one", () => {
    expect(vendorPageHref(0, "vendor")).toBe("/admin/vendors?q=vendor&page=1");
  });
});
