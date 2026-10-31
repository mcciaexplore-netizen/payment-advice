import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { dueFor, paymentRowError, prefillAmount, type PaymentRow } from "@/lib/advice/bulk-payment-rows";
import { payableIsSet, payableNotSetLabel } from "@/lib/advice/payable-status";
import { needsPayableCondition } from "@/lib/advice/bulk-finance-actions";

const neft = (extra: Partial<PaymentRow> = {}): PaymentRow => ({ paymentMode: "NEFT", isAdvance: false, payableAmount: "7000.00", billPassedFor: null, totalPaid: "0", ...extra });
const cash = (extra: Partial<PaymentRow> = {}): PaymentRow => ({ paymentMode: "CASH", isAdvance: false, payableAmount: null, billPassedFor: "900.00", totalPaid: "0", ...extra });

describe("not-set rows", () => {
  it("NEFT without a saved payable amount: Due is not set (never 0.00), no prefill, refused with the not-set wording", () => {
    const row = neft({ payableAmount: null });
    expect(payableIsSet(row)).toBe(false);
    expect(dueFor(row)).toBeNull();
    expect(prefillAmount(row)).toBe("");
    expect(paymentRowError(row, { amount: "100" })).toBe("Payable amount not set. Open the item to set it.");
  });

  it("Cash Voucher without Bill passed for, and a Cash Advance without a payable amount", () => {
    expect(payableNotSetLabel(cash())).toBe("Bill passed for not set");
    expect(paymentRowError(cash({ billPassedFor: null }), { amount: "" })).toBe("Bill passed for not set. Open the item to set it.");
    expect(paymentRowError(cash({ isAdvance: true, billPassedFor: null, payableAmount: null }), { amount: "" })).toBe("Payable amount not set. Open the item to set it.");
  });
});

describe("set and partly paid rows", () => {
  it("prefills the Due amount: payable minus paid so far", () => {
    expect(prefillAmount(neft())).toBe("7000.00");
    expect(prefillAmount(neft({ payableAmount: "1000.00", totalPaid: "400.00" }))).toBe("600.00");
    expect(prefillAmount(cash())).toBe("900.00");
  });

  it("allows an edited (partial) amount and never more than Due", () => {
    const partlyPaid = neft({ payableAmount: "1000.00", totalPaid: "400.00" });
    expect(paymentRowError(partlyPaid, { amount: "250.50" })).toBeNull();
    expect(paymentRowError(partlyPaid, { amount: "600.00" })).toBeNull();
    expect(paymentRowError(partlyPaid, { amount: "600.01" })).toBe("More than the Due of ₹ 600.00.");
    expect(paymentRowError(partlyPaid, { amount: "0" })).toBe("Enter an amount greater than 0.");
    expect(paymentRowError(partlyPaid, { amount: "1.234" })).toBe("At most 2 decimal places.");
  });

  it("Cash rows need no input", () => {
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
