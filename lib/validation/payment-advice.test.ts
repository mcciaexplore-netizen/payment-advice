import { describe, expect, it } from "vitest";
import {
  calculateCashVoucherTotal,
  paymentAdviceFormSchema,
} from "./payment-advice";

const baseCashSubmission = {
  submittedByName: "Priya Sharma",
  submittedByEmail: "priya@example.com",
  submittedByDepartment: "Accounts",
  recommendingAuthorityId: "11111111-1111-4111-8111-111111111111",
  verifiedByName: "Anita Deshmukh",
  sanctionedByName: "Rajesh Kulkarni",
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
