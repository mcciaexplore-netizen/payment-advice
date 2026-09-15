import { describe, expect, it } from "vitest";
import { bankNameForIfsc, IFSC_BANK_NAMES } from "./ifsc-bank-lookup";

describe("bankNameForIfsc", () => {
  it("derives the bank name from a full, real IFSC code", () => {
    expect(bankNameForIfsc("HDFC0001234")).toBe("HDFC Bank");
    expect(bankNameForIfsc("SBIN0000001")).toBe("State Bank of India");
    expect(bankNameForIfsc("ICIC0000104")).toBe("ICICI Bank");
    expect(bankNameForIfsc("UTIB0001436")).toBe("Axis Bank");
  });

  it("matches as soon as exactly 4 characters exist, not just a full 11-character code", () => {
    expect(bankNameForIfsc("HDFC")).toBe("HDFC Bank");
  });

  it("is case-insensitive", () => {
    expect(bankNameForIfsc("hdfc0001234")).toBe("HDFC Bank");
  });

  it("leaves the result undefined for a too-short/in-progress value, never throwing", () => {
    expect(bankNameForIfsc("")).toBeUndefined();
    expect(bankNameForIfsc("HD")).toBeUndefined();
    expect(bankNameForIfsc(null)).toBeUndefined();
    expect(bankNameForIfsc(undefined)).toBeUndefined();
  });

  it("leaves the result undefined for a genuinely unrecognized 4-letter prefix, never throwing", () => {
    expect(bankNameForIfsc("ZZZZ0001234")).toBeUndefined();
    expect(bankNameForIfsc("QQQQ")).toBeUndefined();
  });

  it("ignores anything past the first 4 characters when matching", () => {
    expect(bankNameForIfsc("HDFC9999999")).toBe(bankNameForIfsc("HDFC0000000"));
  });

  it("has no duplicate-looking placeholder entries and every value is non-empty", () => {
    for (const [code, name] of Object.entries(IFSC_BANK_NAMES)) {
      expect(code).toMatch(/^[A-Z]{4}$/);
      expect(name.trim().length).toBeGreaterThan(0);
    }
  });

  it("covers roughly 150-200 major scheduled banks, not a partial guess", () => {
    const count = Object.keys(IFSC_BANK_NAMES).length;
    expect(count).toBeGreaterThanOrEqual(100);
    expect(count).toBeLessThanOrEqual(220);
  });
});
