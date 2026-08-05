import { describe, expect, it } from "vitest";
import { displayNoFor, documentLabelFor } from "./document-identity";

describe("documentLabelFor", () => {
  it("returns 'Payment Advice' for NEFT", () => {
    expect(documentLabelFor("NEFT")).toBe("Payment Advice");
  });

  it("returns 'Cash Payment Voucher' for CASH", () => {
    expect(documentLabelFor("CASH")).toBe("Cash Payment Voucher");
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
});
