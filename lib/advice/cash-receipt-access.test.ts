import { describe, expect, it } from "vitest";
import type { AdminSessionPayload } from "@/lib/auth";
import { canAccessCashReceipt } from "./cash-receipt-access";

const receipt = { issuedByUserId: "user-1" };

function session(overrides: Partial<AdminSessionPayload>): AdminSessionPayload {
  return {
    adminUserId: "user-1",
    fullName: "Test User",
    roles: ["CASH_RECEIPT"],
    recommendingAuthorityId: null,
    ...overrides,
  };
}

describe("canAccessCashReceipt", () => {
  it("denies an unauthenticated session", () => {
    expect(canAccessCashReceipt(null, receipt)).toBe(false);
  });

  it("allows the CASH_RECEIPT account that issued the receipt", () => {
    expect(canAccessCashReceipt(session({ adminUserId: "user-1", branchScope: "Ahilyanagar Office" }), receipt)).toBe(true);
  });

  it("denies a different CASH_RECEIPT account, even one in the same branch", () => {
    expect(canAccessCashReceipt(session({ adminUserId: "user-2", branchScope: "Ahilyanagar Office" }), receipt)).toBe(false);
  });

  it("denies a BRANCH-only account, even the one that issued the receipt (2026-10-07: BRANCH alone no longer grants Cash Receipt access)", () => {
    expect(canAccessCashReceipt(session({ adminUserId: "user-1", roles: ["BRANCH"], branchScope: "Ahilyanagar Office" }), receipt)).toBe(false);
  });

  it("allows a BRANCH+CASH_RECEIPT account that issued the receipt", () => {
    expect(canAccessCashReceipt(session({ adminUserId: "user-1", roles: ["BRANCH", "CASH_RECEIPT"], branchScope: "Ahilyanagar Office" }), receipt)).toBe(true);
  });

  it.each(["PAYMENT_ADVICE", "CASH_VOUCHER", "ALL"] as const)("allows any Finance session (%s) regardless of who issued it", (role) => {
    expect(canAccessCashReceipt(session({ adminUserId: "finance-1", roles: [role] }), receipt)).toBe(true);
  });

  it("denies a non-Finance, non-CASH_RECEIPT session (e.g. AUTHORITY or SELF)", () => {
    expect(canAccessCashReceipt(session({ adminUserId: "auth-1", roles: ["AUTHORITY"], recommendingAuthorityId: "ra-1" }), receipt)).toBe(false);
    expect(canAccessCashReceipt(session({ adminUserId: "self-1", roles: ["SELF"] }), receipt)).toBe(false);
  });

  it("a Finance session also holding AUTHORITY still gets access via hasFinanceRole", () => {
    expect(canAccessCashReceipt(session({ adminUserId: "dual-1", roles: ["AUTHORITY", "ALL"], recommendingAuthorityId: "ra-1" }), receipt)).toBe(true);
  });
});
