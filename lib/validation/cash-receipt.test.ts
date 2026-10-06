import { describe, expect, it } from "vitest";
import { cashReceiptSchema, type CashReceiptInput } from "./cash-receipt";

const receipt: CashReceiptInput = {
  partyName: "Example Party",
  gstin: "27AAATM5559Q1ZS",
  items: [
    { particulars: "Sale of Directory - Defence Directory - Member (Member ID: 123)", copies: 2, price: 900, billNo: "", billDate: "" },
  ],
};

describe("Cash Receipt validation", () => {
  it("accepts a valid receipt and preserves item values", () => {
    const parsed = cashReceiptSchema.parse(receipt);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].copies).toBe(2);
    expect(parsed.items[0].price).toBe(900);
  });

  it("rejects a blank party name", () => {
    expect(cashReceiptSchema.safeParse({ ...receipt, partyName: " \n " }).success).toBe(false);
  });

  it("GSTIN is optional - absent or blank both pass", () => {
    const withoutGstin: Partial<CashReceiptInput> = { ...receipt };
    delete withoutGstin.gstin;
    expect(cashReceiptSchema.safeParse(withoutGstin).success).toBe(true);
    expect(cashReceiptSchema.safeParse({ ...receipt, gstin: "" }).success).toBe(true);
  });

  it("rejects a malformed GSTIN rather than silently storing it", () => {
    expect(cashReceiptSchema.safeParse({ ...receipt, gstin: "not-a-gstin" }).success).toBe(false);
    expect(cashReceiptSchema.safeParse({ ...receipt, gstin: "27AAATM5559Q1Z" }).success).toBe(false);
  });

  it("requires at least one item", () => {
    expect(cashReceiptSchema.safeParse({ ...receipt, items: [] }).success).toBe(false);
  });

  it("caps items at 20", () => {
    const items = Array.from({ length: 21 }, () => receipt.items[0]);
    expect(cashReceiptSchema.safeParse({ ...receipt, items }).success).toBe(false);
    expect(cashReceiptSchema.safeParse({ ...receipt, items: items.slice(0, 20) }).success).toBe(true);
  });

  it.each([0, -1, -0.01])("rejects nonpositive copies %s", (copies) => {
    expect(cashReceiptSchema.safeParse({ ...receipt, items: [{ ...receipt.items[0], copies }] }).success).toBe(false);
  });

  it("rejects a fractional copies count", () => {
    expect(cashReceiptSchema.safeParse({ ...receipt, items: [{ ...receipt.items[0], copies: 1.5 }] }).success).toBe(false);
  });

  it.each([0, -1])("rejects nonpositive price %s", (price) => {
    expect(cashReceiptSchema.safeParse({ ...receipt, items: [{ ...receipt.items[0], price }] }).success).toBe(false);
  });

  it("accepts a fractional price", () => {
    expect(cashReceiptSchema.safeParse({ ...receipt, items: [{ ...receipt.items[0], price: 12.5 }] }).success).toBe(true);
  });

  it("branch is not part of this schema — it is never taken from the request body", () => {
    expect("branch" in cashReceiptSchema.shape).toBe(false);
  });
});
