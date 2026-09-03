import { describe, expect, it } from "vitest";
import { defaultPaymentModeForRole } from "./role-scope";

describe("defaultPaymentModeForRole", () => {
  it("matches the existing Payment Advice landing scope", () => {
    expect(defaultPaymentModeForRole("PAYMENT_ADVICE")).toBe("NEFT");
  });

  it("matches the existing Cash Voucher landing scope", () => {
    expect(defaultPaymentModeForRole("CASH_VOUCHER")).toBe("CASH");
  });

  it("leaves All Access unscoped", () => {
    expect(defaultPaymentModeForRole("ALL")).toBeUndefined();
  });
});
