import { describe, expect, it } from "vitest";
import { defaultPaymentModeForRole, defaultPaymentModeForRoles } from "./role-scope";

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

describe("defaultPaymentModeForRoles (multi-role)", () => {
  it("matches the single-role behavior exactly for a one-role session", () => {
    expect(defaultPaymentModeForRoles(["PAYMENT_ADVICE"])).toBe("NEFT");
    expect(defaultPaymentModeForRoles(["CASH_VOUCHER"])).toBe("CASH");
    expect(defaultPaymentModeForRoles(["ALL"])).toBeUndefined();
  });

  it("AUTHORITY alone (shouldn't reach Finance Admin, but defensively) is unscoped", () => {
    expect(defaultPaymentModeForRoles(["AUTHORITY"])).toBeUndefined();
  });

  it("a dual-role account with AUTHORITY + a single Finance role keeps that Finance role's default", () => {
    expect(defaultPaymentModeForRoles(["AUTHORITY", "PAYMENT_ADVICE"])).toBe("NEFT");
    expect(defaultPaymentModeForRoles(["AUTHORITY", "CASH_VOUCHER"])).toBe("CASH");
  });

  it("Chintamani's AUTHORITY + ALL combination shows everything (Full Admin), same as ALL alone", () => {
    expect(defaultPaymentModeForRoles(["AUTHORITY", "ALL"])).toBeUndefined();
  });

  it("holding both narrow Finance roles at once shows everything rather than guessing", () => {
    expect(defaultPaymentModeForRoles(["PAYMENT_ADVICE", "CASH_VOUCHER"])).toBeUndefined();
  });
});
