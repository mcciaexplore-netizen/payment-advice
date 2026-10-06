import { describe, expect, it } from "vitest";
import type { AdminSessionPayload } from "@/lib/auth";
import { canAccessCashReceipt } from "./cash-receipt-access";

const receipt = { issuedByUserId: "user-1" };

function session(overrides: Partial<AdminSessionPayload>): AdminSessionPayload {
  return {
    adminUserId: "user-1",
    fullName: "Test User",
    roles: ["BRANCH"],
    recommendingAuthorityId: null,
    ...overrides,
  };
}

describe("canAccessCashReceipt", () => {
  it("denies an unauthenticated session", () => {
    expect(canAccessCashReceipt(null, receipt)).toBe(false);
  });

  it("allows the branch account that issued the receipt", () => {
    expect(canAccessCashReceipt(session({ adminUserId: "user-1", branchScope: "Ahilyanagar Office" }), receipt)).toBe(true);
  });

  it("denies a different branch account, even one in the same branch", () => {
    expect(canAccessCashReceipt(session({ adminUserId: "user-2", branchScope: "Ahilyanagar Office" }), receipt)).toBe(false);
  });

  it.each(["PAYMENT_ADVICE", "CASH_VOUCHER", "ALL"] as const)("allows any Finance session (%s) regardless of who issued it", (role) => {
    expect(canAccessCashReceipt(session({ adminUserId: "finance-1", roles: [role] }), receipt)).toBe(true);
  });

  it("denies a non-Finance, non-BRANCH session (e.g. AUTHORITY or SELF)", () => {
    expect(canAccessCashReceipt(session({ adminUserId: "auth-1", roles: ["AUTHORITY"], recommendingAuthorityId: "ra-1" }), receipt)).toBe(false);
    expect(canAccessCashReceipt(session({ adminUserId: "self-1", roles: ["SELF"] }), receipt)).toBe(false);
  });

  it("a Finance session also holding AUTHORITY still gets access via hasFinanceRole", () => {
    expect(canAccessCashReceipt(session({ adminUserId: "dual-1", roles: ["AUTHORITY", "ALL"], recommendingAuthorityId: "ra-1" }), receipt)).toBe(true);
  });
});
