import { describe, expect, it } from "vitest";
import { billPassedForLabelFor, displayNoFor, documentLabelFor } from "./document-identity";

describe("documentLabelFor", () => {
  it("returns 'Payment Advice' for NEFT", () => {
    expect(documentLabelFor("NEFT")).toBe("Payment Advice");
  });

  it("returns 'Cash Payment Voucher' for CASH", () => {
    expect(documentLabelFor("CASH")).toBe("Cash Payment Voucher");
  });

  it("prefixes 'Advance' for an advance, regardless of NEFT/CASH sub-route", () => {
    expect(documentLabelFor("NEFT", true)).toBe("Advance Payment Advice");
    expect(documentLabelFor("CASH", true)).toBe("Advance Cash Voucher");
  });

  it("isAdvance defaults to false, so existing call sites are unaffected", () => {
    expect(documentLabelFor("NEFT")).toBe("Payment Advice");
  });
});

describe("displayNoFor", () => {
  it("returns serialNo for NEFT, ignoring cashVoucherNo entirely", () => {
    expect(displayNoFor("NEFT", "MCCIA/2026-27/0036", null)).toBe("MCCIA/2026-27/0036");
    expect(displayNoFor("NEFT", "MCCIA/2026-27/0036", "CASH/MCCIA/2026-27/0003")).toBe(
      "MCCIA/2026-27/0036",
    );
  });

  it("returns cashVoucherNo for CASH when set", () => {
    expect(displayNoFor("CASH", "MCCIA/2026-27/0036", "CASH/MCCIA/2026-27/0003")).toBe(
      "CASH/MCCIA/2026-27/0003",
    );
  });

  it("falls back to serialNo for CASH if cashVoucherNo is unexpectedly null", () => {
    expect(displayNoFor("CASH", "MCCIA/2026-27/0036", null)).toBe("MCCIA/2026-27/0036");
  });

  it("returns advanceNo when isAdvance, for either NEFT- or Cash-routed advances — superseding cashVoucherNo too", () => {
    expect(
      displayNoFor("NEFT", "MCCIA/2026-27/0036", null, true, "ADV/MCCIA/2026-27/0005"),
    ).toBe("ADV/MCCIA/2026-27/0005");
    expect(
      displayNoFor(
        "CASH",
        "MCCIA/2026-27/0036",
        "CASH/MCCIA/2026-27/0003",
        true,
        "ADV/MCCIA/2026-27/0005",
      ),
    ).toBe("ADV/MCCIA/2026-27/0005");
  });

  it("falls back to serialNo if isAdvance but advanceNo is unexpectedly null", () => {
    expect(displayNoFor("NEFT", "MCCIA/2026-27/0036", null, true, null)).toBe(
      "MCCIA/2026-27/0036",
    );
  });

  it("isAdvance/advanceNo default to false/null, so existing call sites are unaffected", () => {
    expect(displayNoFor("CASH", "MCCIA/2026-27/0036", "CASH/MCCIA/2026-27/0003")).toBe(
      "CASH/MCCIA/2026-27/0003",
    );
  });
});

describe("billPassedForLabelFor", () => {
  it("returns 'Bill passed for Rs.' for a regular submission", () => {
    expect(billPassedForLabelFor(false)).toBe("Bill passed for Rs.");
  });

  it("returns 'Amount Sanctioned' for an advance", () => {
    expect(billPassedForLabelFor(true)).toBe("Amount Sanctioned");
  });
});
