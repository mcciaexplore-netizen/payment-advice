import { describe, expect, it } from "vitest";
import {
  calculateAdvanceParticularsTotal,
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

  it("rejects a missing billNo for a non-advance submission", () => {
    const rest: Record<string, unknown> = { ...baseNeftSubmission };
    delete rest.billNo;
    const result = paymentAdviceFormSchema.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join(".") === "billNo")).toBe(true);
    }
  });

  it("rejects a missing billDate for a non-advance submission", () => {
    const rest: Record<string, unknown> = { ...baseNeftSubmission };
    delete rest.billDate;
    const result = paymentAdviceFormSchema.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join(".") === "billDate")).toBe(true);
    }
  });

  it("rejects a future billDate for a non-advance submission", () => {
    const result = paymentAdviceFormSchema.safeParse({
      ...baseNeftSubmission,
      billDate: "2099-01-01",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join(".") === "billDate")).toBe(true);
    }
  });
});

const baseAdvanceNeftSubmission = {
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
  isAdvance: true,
  purposeOfAdvance: "Client visit to Delhi",
  previousPendingAdvanceAmount: 0,
  bankAccountNo: "123456789012",
  bankIfsc: "HDFC0001234",
  beneficiaryName: "Acme Supplies",
  cashVoucherItems: [],
  advanceParticulars: [
    { category: "CONVEYANCE" as const, amount: 500 },
    { category: "TRAVELING" as const, amount: 1500 },
  ],
  amount: 2000,
};

describe("Advance Payment validation", () => {
  it("accepts an advance when the Particulars total matches amount, bypassing Basic/GST entirely", () => {
    const result = paymentAdviceFormSchema.safeParse(baseAdvanceNeftSubmission);
    expect(result.success).toBe(true);
  });

  it("computes the Particulars total in paise", () => {
    expect(calculateAdvanceParticularsTotal(baseAdvanceNeftSubmission.advanceParticulars)).toBe(
      2000,
    );
  });

  it("rejects a missing Purpose of Advance", () => {
    const rest: Record<string, unknown> = { ...baseAdvanceNeftSubmission };
    delete rest.purposeOfAdvance;
    const result = paymentAdviceFormSchema.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join(".") === "purposeOfAdvance")).toBe(
        true,
      );
    }
  });

  it("rejects zero Particulars line items", () => {
    const result = paymentAdviceFormSchema.safeParse({
      ...baseAdvanceNeftSubmission,
      advanceParticulars: [],
      amount: 0,
    });
    expect(result.success).toBe(false);
  });

  it("requires otherDescription when category is OTHER", () => {
    const result = paymentAdviceFormSchema.safeParse({
      ...baseAdvanceNeftSubmission,
      advanceParticulars: [{ category: "OTHER", amount: 2000 }],
      amount: 2000,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some(
          (issue) => issue.path.join(".") === "advanceParticulars.0.otherDescription",
        ),
      ).toBe(true);
    }
  });

  it("accepts OTHER with a description", () => {
    const result = paymentAdviceFormSchema.safeParse({
      ...baseAdvanceNeftSubmission,
      advanceParticulars: [{ category: "OTHER", otherDescription: "Venue booking", amount: 2000 }],
      amount: 2000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a Particulars total that doesn't match the submitted amount", () => {
    const result = paymentAdviceFormSchema.safeParse({ ...baseAdvanceNeftSubmission, amount: 999 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join(".") === "amount")).toBe(true);
    }
  });

  it("defaults Previous Pending Advance amount to 0 and does not require 'Since' when 0", () => {
    const rest: Record<string, unknown> = { ...baseAdvanceNeftSubmission };
    delete rest.previousPendingAdvanceAmount;
    const result = paymentAdviceFormSchema.safeParse(rest);
    expect(result.success).toBe(true);
  });

  it("requires 'Since' when Previous Pending Advance amount is > 0", () => {
    const result = paymentAdviceFormSchema.safeParse({
      ...baseAdvanceNeftSubmission,
      previousPendingAdvanceAmount: 5000,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some(
          (issue) => issue.path.join(".") === "previousPendingAdvanceSince",
        ),
      ).toBe(true);
    }
  });

  it("accepts Previous Pending Advance > 0 when 'Since' is provided", () => {
    const result = paymentAdviceFormSchema.safeParse({
      ...baseAdvanceNeftSubmission,
      previousPendingAdvanceAmount: 5000,
      previousPendingAdvanceSince: "2026-06-01",
    });
    expect(result.success).toBe(true);
  });

  it("does NOT require NEFT bank details for an NEFT-routed advance — Finance already has them on file for staff", () => {
    const rest: Record<string, unknown> = { ...baseAdvanceNeftSubmission };
    delete rest.bankAccountNo;
    delete rest.bankIfsc;
    delete rest.beneficiaryName;
    const result = paymentAdviceFormSchema.safeParse(rest);
    expect(result.success).toBe(true);
    // Sanity: the same shape WITHOUT isAdvance would fail for missing bank details.
    const nonAdvanceResult = paymentAdviceFormSchema.safeParse({ ...rest, isAdvance: false });
    expect(nonAdvanceResult.success).toBe(false);
  });

  it("still accepts NEFT bank details when the submitter provides them anyway on an advance", () => {
    expect(paymentAdviceFormSchema.safeParse(baseAdvanceNeftSubmission).success).toBe(true);
  });

  it("does NOT require billNo/billDate/PO/Delivery Challan for an advance — no bill exists yet", () => {
    const rest: Record<string, unknown> = { ...baseAdvanceNeftSubmission };
    delete rest.billNo;
    delete rest.billDate;
    const result = paymentAdviceFormSchema.safeParse(rest);
    expect(result.success).toBe(true);
  });

  it("tolerates a stale empty-string billDate/basicAmount/gstAmount/NaN left behind by a hidden field react-hook-form registered before the mode switch to Advance", () => {
    // Regression guard: billDate, poDate, deliveryChallanDate, basicAmount
    // and gstAmount all render (and so get registered by react-hook-form)
    // by default, since paymentMode defaults to NEFT non-advance on page
    // load. If the submitter switches straight to Advance Payment without
    // ever touching them, react-hook-form retains their untouched native
    // uncontrolled defaults ("" for date/text inputs, NaN for a
    // valueAsNumber-registered empty number input) in its internal form
    // state even after the fields unmount — this must not silently block
    // submission (previously did: optionalDateString's regex ran before
    // its empty-to-undefined transform, and NaN isn't forgiven by
    // z.number().optional()).
    const result = paymentAdviceFormSchema.safeParse({
      ...baseAdvanceNeftSubmission,
      billDate: "",
      poDate: "",
      deliveryChallanDate: "",
      basicAmount: NaN,
      gstAmount: NaN,
    });
    expect(result.success).toBe(true);
  });

  it("tolerates the same stale empty-string 'Since' left behind after Previous Pending Advance amount drops back to 0", () => {
    const result = paymentAdviceFormSchema.safeParse({
      ...baseAdvanceNeftSubmission,
      previousPendingAdvanceAmount: 0,
      previousPendingAdvanceSince: "",
    });
    expect(result.success).toBe(true);
  });

  it("does NOT require basicAmount/gstAmount/natureOfExpenditure for an advance", () => {
    const result = paymentAdviceFormSchema.safeParse(baseAdvanceNeftSubmission);
    expect(result.success).toBe(true);
    // Sanity: the same shape WITHOUT isAdvance would fail for missing basicAmount.
    const nonAdvanceResult = paymentAdviceFormSchema.safeParse({
      ...baseAdvanceNeftSubmission,
      isAdvance: false,
    });
    expect(nonAdvanceResult.success).toBe(false);
  });

  it("accepts a Cash-routed advance, bypassing cashVoucherItems entirely", () => {
    const result = paymentAdviceFormSchema.safeParse({
      ...baseAdvanceNeftSubmission,
      paymentMode: "CASH" as const,
      bankAccountNo: undefined,
      bankIfsc: undefined,
      beneficiaryName: undefined,
    });
    expect(result.success).toBe(true);
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

  it("tolerates a stale NaN basicAmount/gstAmount left behind by react-hook-form when the submitter switches straight from the default NEFT mode to Cash", () => {
    // Same regression class as the Advance Payment case above — basicAmount
    // and gstAmount render by default (paymentMode starts as NEFT), so they
    // get registered before a submitter who goes straight to Cash ever
    // touches them.
    const result = paymentAdviceFormSchema.safeParse({
      ...baseCashSubmission,
      billNo: "INV-1",
      billDate: "2026-07-20",
      basicAmount: NaN,
      gstAmount: NaN,
    });
    expect(result.success).toBe(true);
  });
});
