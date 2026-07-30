import { describe, expect, it } from "vitest";
import {
  calculateCashVoucherTotal,
  paymentAdviceFormSchema,
  VERIFIER_NAMES,
  verifierNameSchema,
} from "./payment-advice";

describe("VERIFIER_NAMES spelling", () => {
  it('spells the name "Abha Khatavkar", matching the authoritative staff/email list (not the earlier "Aabha" typo)', () => {
    expect(VERIFIER_NAMES).toContain("Abha Khatavkar");
    expect(VERIFIER_NAMES).not.toContain("Aabha Khatavkar");
  });

  it("rejects the old misspelling as an invalid verifier", () => {
    expect(verifierNameSchema.safeParse("Aabha Khatavkar").success).toBe(false);
  });

  it("accepts the corrected spelling", () => {
    expect(verifierNameSchema.safeParse("Abha Khatavkar").success).toBe(true);
  });
});

const baseCashSubmission = {
  submittedByName: "Priya Sharma",
  submittedByEmail: "priya@example.com",
  submittedByDepartment: "Accounts",
  recommendingAuthorityId: "11111111-1111-4111-8111-111111111111",
  verifiedByName: "Anita Deshmukh",
  payeeName: "Acme Supplies",
  payeeAddress: "Pune",
  billNo: "INV-1",
  billDate: "2026-07-20",
  formDate: "2026-07-21",
  paymentMode: "CASH" as const,
  amount: 150.5,
  cashVoucherItems: [
    { description: "Stationery", amount: 100.25 },
    { description: "Local conveyance", amount: 50.25 },
  ],
};

describe("Cash voucher validation", () => {
  it("sums item amounts in paise", () => {
    expect(calculateCashVoucherTotal(baseCashSubmission.cashVoucherItems)).toBe(150.5);
  });

  it("accepts a Cash submission when the server-side item sum matches amount", () => {
    expect(paymentAdviceFormSchema.safeParse(baseCashSubmission).success).toBe(true);
  });

  it("rejects a client-supplied amount that differs from the item total", () => {
    const result = paymentAdviceFormSchema.safeParse({
      ...baseCashSubmission,
      amount: 150.49,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join(".") === "amount")).toBe(true);
    }
  });
});
