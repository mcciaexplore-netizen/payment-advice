import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("digital stamp wording and signing-field boundaries", () => {
  it("uses RECOMMENDED, never APPROVED, for both PDF recommendation stamps", () => {
    const payment = read("lib/pdf/PaymentAdviceDocument.tsx");
    const cash = read("lib/pdf/CashVoucherDocument.tsx");
    expect(payment).toContain('label="RECOMMENDED"');
    expect(cash).toContain('label: "RECOMMENDED"');
    expect(cash).not.toContain('label: "APPROVED"');
  });

  it("removes signing labels only from digitally stamped Payment Advice boxes", () => {
    const source = read("lib/pdf/PaymentAdviceDocument.tsx");
    const submitted = source.slice(source.indexOf("Submitted by :"), source.indexOf("Recommended by :"));
    const recommended = source.slice(source.indexOf("Recommended by :"), source.indexOf("Verified by :"));
    const verified = source.slice(source.indexOf("Verified by :"), source.indexOf("Sanctioned by:"));
    const sanctioned = source.slice(source.indexOf("Sanctioned by:"));
    for (const stamped of [submitted, recommended, verified]) {
      expect(stamped).not.toContain("Date :");
      expect(stamped).not.toContain("Signature :");
    }
    expect(sanctioned).toContain("Date :");
    expect(sanctioned).toContain("Signature :");
    expect(sanctioned).not.toContain("<Stamp");
  });

  it("keeps Cash physical-signing fields while suppressing them for digital-stamp boxes", () => {
    const source = read("lib/pdf/CashVoucherDocument.tsx");
    expect(source.match(/showSigningFields=\{false\}/g)).toHaveLength(2);
    expect(source).toContain('<Signature label="Sanctioned by" name={data.sanctionedBy ?? ""} />');
    expect(source).toContain('<Signature label="Payee\'s Signature" name="" />');
  });
});
