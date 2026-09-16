import { describe, expect, it } from "vitest";
import { vendorReviewActionSchema } from "./vendor-review";

describe("vendorReviewActionSchema", () => {
  it("accepts an existing vendor link", () => {
    expect(
      vendorReviewActionSchema.parse({
        action: "link",
        vendorId: "22222222-2222-4222-8222-222222222222",
      }),
    ).toEqual({
      action: "link",
      vendorId: "22222222-2222-4222-8222-222222222222",
    });
  });

  it("trims a new canonical vendor and treats a blank address as absent", () => {
    expect(
      vendorReviewActionSchema.parse({
        action: "create",
        companyName: "  Vendor Name  ",
        address: "   ",
      }),
    ).toEqual({ action: "create", companyName: "Vendor Name", address: undefined });
  });

  it("requires a canonical name", () => {
    expect(
      vendorReviewActionSchema.safeParse({ action: "create", companyName: " " }).success,
    ).toBe(false);
  });
});
