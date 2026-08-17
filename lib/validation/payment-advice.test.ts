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

const baseNeftSubmission = {
  submittedByName: "Priya Sharma",
  submittedByEmail: "priya@example.com",
  submittedByDepartment: "Accounts",
  recommendingAuthorityId: "11111111-1111-4111-8111-111111111111",
  payeeName: "Acme Supplies",
  payeeAddress: "Pune",
  billNo: "INV-1",
  billDate: "2026-07-20",
  formDate: "2026-07-21",
  paymentMode: "NEFT" as const,
  natureOfExpenditure: "Office supplies",
  bankAccountNo: "123456789012",
  bankIfsc: "HDFC0001234",
  beneficiaryName: "Acme Supplies",
  cashVoucherItems: [],
  basicAmount: 1000,
  gstAmount: 180,
  amount: 1180,
};

describe("NEFT Basic/GST split validation", () => {
  it("accepts a NEFT submission when basicAmount + gstAmount equals amount", () => {
    expect(paymentAdviceFormSchema.safeParse(baseNeftSubmission).success).toBe(true);
  });

  it("accepts gstAmount of exactly 0 (GST not applicable)", () => {
    const result = paymentAdviceFormSchema.safeParse({
      ...baseNeftSubmission,
      gstAmount: 0,
      amount: 1000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing basicAmount", () => {
    const rest: Record<string, unknown> = { ...baseNeftSubmission };
    delete rest.basicAmount;
    const result = paymentAdviceFormSchema.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join(".") === "basicAmount")).toBe(true);
    }
  });

  it("rejects a missing gstAmount — must be explicit, even when 0", () => {
    const rest: Record<string, unknown> = { ...baseNeftSubmission };
    delete rest.gstAmount;
    const result = paymentAdviceFormSchema.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join(".") === "gstAmount")).toBe(true);
    }
  });

  it("rejects a negative gstAmount", () => {
    const result = paymentAdviceFormSchema.safeParse({ ...baseNeftSubmission, gstAmount: -5 });
    expect(result.success).toBe(false);
  });

  it("rejects a total that doesn't match basicAmount + gstAmount", () => {
    const result = paymentAdviceFormSchema.safeParse({ ...baseNeftSubmission, amount: 999 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join(".") === "amount")).toBe(true);
    }
  });
});

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
