import { describe, expect, it } from "vitest";
import { forwardingMemoSchema, type ForwardingMemoInput } from "./forwarding-memo";

const memo: ForwardingMemoInput = {
  memoDate: "2026-09-17",
  partyName: "Example Party",
  partyAddress: "Example address, Pune",
  purpose: "Membership fees",
  billNo: "000123",
  billDate: "2026-09-01",
  instrumentMode: "CHEQUE",
  instrumentNo: "000042",
  instrumentDate: "2026-09-16",
  drawnOnBank: "Example Bank",
  amount: 1234.56,
  submittedByName: "Example Submitter",
};

describe("Forwarding Memo validation", () => {
  it.each(["CHEQUE", "DD"] as const)("accepts %s and preserves reference-number zeros", (instrumentMode) => {
    const parsed = forwardingMemoSchema.parse({ ...memo, instrumentMode });
    expect(parsed.instrumentNo).toBe("000042");
    expect(parsed.billNo).toBe("000123");
  });

  it.each(["CASH", "NEFT", "UPI", "", undefined])("rejects unrequested mode %s", (instrumentMode) => {
    expect(forwardingMemoSchema.safeParse({ ...memo, instrumentMode }).success).toBe(false);
  });

  it.each(["partyName", "partyAddress", "purpose", "instrumentNo", "drawnOnBank", "submittedByName"])(
    "rejects blank %s",
    (field) => expect(forwardingMemoSchema.safeParse({ ...memo, [field]: " \n " }).success).toBe(false),
  );

  it.each(["memoDate", "billDate", "instrumentDate"])("checks real calendar dates for %s", (field) => {
    for (const invalid of ["2026-02-29", "2026-04-31", "2026-13-01", "0000-01-01", "17/09/2026"]) {
      expect(forwardingMemoSchema.safeParse({ ...memo, [field]: invalid }).success).toBe(false);
    }
    expect(forwardingMemoSchema.safeParse({ ...memo, [field]: "2028-02-29" }).success).toBe(true);
  });

  it.each([0, -1, 1.001, NaN, Infinity, 1_000_000_000_000])("rejects unrepresentable or nonpositive amount %s", (amount) => {
    expect(forwardingMemoSchema.safeParse({ ...memo, amount }).success).toBe(false);
  });

  it.each([0.01, 10.1, 999_999_999_999.99])("accepts valid currency amount %s", (amount) => {
    expect(forwardingMemoSchema.parse({ ...memo, amount }).amount).toBe(amount);
  });

  it("trims text and normalizes unprovided bill details", () => {
    const parsed = forwardingMemoSchema.parse({ ...memo, partyName: "  Example Party  ", billNo: " ", billDate: "" });
    expect(parsed.partyName).toBe("Example Party");
    expect(parsed.billNo).toBeUndefined();
    expect(parsed.billDate).toBeUndefined();
  });

  it("bounds the submitter name to fit the physical-signature area", () => {
    expect(forwardingMemoSchema.safeParse({ ...memo, submittedByName: "W".repeat(200) }).success).toBe(true);
    expect(forwardingMemoSchema.safeParse({ ...memo, submittedByName: "W".repeat(201) }).success).toBe(false);
  });
});
