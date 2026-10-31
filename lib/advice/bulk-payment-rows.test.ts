import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { bulkPayable, dueFor, paymentRowError, prefillAmount, usesBasic, type PaymentRow } from "@/lib/advice/bulk-payment-rows";
import { payableIsSet, payableNotSetLabel } from "@/lib/advice/payable-status";
import { needsPayableCondition } from "@/lib/advice/bulk-finance-actions";

const neft = (extra: Partial<PaymentRow> = {}): PaymentRow => ({ paymentMode: "NEFT", isAdvance: false, amount: "8260.00", basicAmount: "7000.00", payableAmount: "7000.00", billPassedFor: null, totalPaid: "0", ...extra });
const cash = (extra: Partial<PaymentRow> = {}): PaymentRow => ({ paymentMode: "CASH", isAdvance: false, amount: "950.00", basicAmount: null, payableAmount: null, billPassedFor: "900.00", totalPaid: "0", ...extra });

describe("rows with no payable calculation are paid on Basic, no deductions", () => {
  it("NEFT without a saved payable: payable in bulk, Due and prefill are the Basic amount (not the total with GST)", () => {
    const row = neft({ payableAmount: null, basicAmount: "76525.42", amount: "90300.00" });
    expect(payableIsSet(row)).toBe(false);
    expect(usesBasic(row)).toBe(true);
    expect(bulkPayable(row)).toBe(true);
    expect(dueFor(row)).toBe(76525.42);
    expect(prefillAmount(row)).toBe("76525.42");
  });

  it("the amount is editable, partial allowed, never above Basic", () => {
    const row = neft({ payableAmount: null, basicAmount: "1000.00" });
    expect(paymentRowError(row, { amount: "1000.00" })).toBeNull();
    expect(paymentRowError(row, { amount: "400.50" })).toBeNull();
    expect(paymentRowError(row, { amount: "1000.01" })).toBe("More than the Basic amount of ₹ 1,000.00.");
    expect(paymentRowError(row, { amount: "0" })).toBe("Enter an amount greater than 0.");
  });

  it("an NEFT Advance uses its amount as the base, as the calculator does", () => {
    const row = neft({ isAdvance: true, payableAmount: null, basicAmount: null, amount: "25000.00" });
    expect(usesBasic(row)).toBe(true);
    expect(prefillAmount(row)).toBe("25000.00");
  });

  it("NEFT with no Basic stored stays blocked", () => {
    const row = neft({ payableAmount: null, basicAmount: null });
    expect(bulkPayable(row)).toBe(false);
    expect(dueFor(row)).toBeNull();
    expect(paymentRowError(row, { amount: "100" })).toBe("Basic amount not available. Open the item to set the payable.");
  });

  it("Cash Voucher without Bill passed for: paid on the voucher amount, no input", () => {
    const row = cash({ billPassedFor: null });
    expect(payableNotSetLabel(row)).toBe("Bill passed for not set");
    expect(usesBasic(row)).toBe(true);
    expect(dueFor(row)).toBe(950);
    expect(paymentRowError(row, { amount: "" })).toBeNull();
  });

  it("a Cash-routed Advance without its payable amount stays blocked (needs its own calculation)", () => {
    const row = cash({ isAdvance: true, billPassedFor: null, payableAmount: null });
    expect(bulkPayable(row)).toBe(false);
    expect(paymentRowError(row, { amount: "" })).toBe("Payable amount not set. Open the item to set it.");
  });
});

describe("rows with a saved payable are unchanged", () => {
  it("prefills the Due amount: payable minus paid so far", () => {
    expect(usesBasic(neft())).toBe(false);
    expect(prefillAmount(neft({ payableAmount: "6650.00" }))).toBe("6650.00");
    expect(prefillAmount(neft({ payableAmount: "1000.00", totalPaid: "400.00" }))).toBe("600.00");
    expect(prefillAmount(cash())).toBe("900.00");
  });

  it("allows an edited (partial) amount and never more than Due", () => {
    const partlyPaid = neft({ payableAmount: "1000.00", totalPaid: "400.00" });
    expect(paymentRowError(partlyPaid, { amount: "250.50" })).toBeNull();
    expect(paymentRowError(partlyPaid, { amount: "600.00" })).toBeNull();
    expect(paymentRowError(partlyPaid, { amount: "600.01" })).toBe("More than the Due of ₹ 600.00.");
    expect(paymentRowError(partlyPaid, { amount: "1.234" })).toBe("At most 2 decimal places.");
  });

  it("Cash rows with Bill passed for need no input", () => {
    expect(paymentRowError(cash(), { amount: "" })).toBeNull();
  });
});

describe("Needs payable calculation filter", () => {
  it("matches NEFT without payable, Cash Vouchers without Bill passed for, Cash Advances without payable", () => {
    const sql = new PgDialect().sqlToQuery(needsPayableCondition()).sql;
    expect(sql).toContain('"payment_advices"."payable_amount" is null');
    expect(sql).toContain('"payment_advices"."bill_passed_for" is null');
  });
});
