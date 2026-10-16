import { describe, expect, it } from "vitest";
import { bankDetailsMismatch, findConfidentInvoiceVendor, invoiceExtractionSchema, invoiceBeneficiaryName } from "@/lib/invoice-autofill";

const vendor = (id: string, companyName: string) => ({
  id,
  companyName,
  contactPerson: null,
  contactPhone: null,
  address: null,
  email: null,
  gstin: null,
  udyamNumber: null,
});

describe("findConfidentInvoiceVendor", () => {
  it("selects an exact canonical vendor despite punctuation and legal suffixes", () => {
    const result = findConfidentInvoiceVendor("Acme Services Pvt. Ltd.", [vendor("1", "ACME SERVICES PRIVATE LIMITED")]);
    expect(result?.id).toBe("1");
  });

  it("does not select a merely similar vendor", () => {
    const result = findConfidentInvoiceVendor("Acme Trading", [vendor("1", "Acme Traders")]);
    expect(result).toBeNull();
  });

  it("does not choose between close competing vendors", () => {
    const result = findConfidentInvoiceVendor("Apex Services", [
      vendor("1", "Apex Services Pvt Ltd"),
      vendor("2", "APEX SERVICES LIMITED"),
    ]);
    expect(result).toBeNull();
  });

  it("ignores MCCIA's own internal ledger tags (-CR/-NEW/-JW) when matching a real invoice name", () => {
    // Real case: "BUSINARY CONSULTANCY SERVICES LLP-CR" (~9% of the vendor
    // master carries one of these tags) vs. the invoice's own printed name,
    // which never includes it.
    const result = findConfidentInvoiceVendor("Businary Consultancy Services LLP", [
      vendor("1", "BUSINARY CONSULTANCY SERVICES LLP-CR"),
    ]);
    expect(result?.id).toBe("1");
  });

  it("handles chained internal tags (-CR-NEW, -CR-JW)", () => {
    expect(
      findConfidentInvoiceVendor("Chitale Bandhu Mithaiwale", [
        vendor("1", "CHITALE BANDHU  MITHAIWALE -CR-NEW"),
      ])?.id,
    ).toBe("1");
    expect(
      findConfidentInvoiceVendor("Ventive Hospitality Private Limited", [
        vendor("1", "VENTIVE HOSPITALITY PRIVATE LIMITED-CR-JW"),
      ])?.id,
    ).toBe("1");
  });

  it("still declines when stripping tags makes two real vendor rows collide (e.g. a duplicated ledger entry)", () => {
    // Confirmed against the real vendor master: these collapse to the same
    // normalized name once tags are stripped — correctly falls back to
    // manual selection rather than guessing which row is "the" vendor.
    const result = findConfidentInvoiceVendor("Sahyadri Motors Private Limited", [
      vendor("1", "SAHYADRI MOTORS PRIVATE LIMITED"),
      vendor("2", "SAHYADRI MOTORS PRIVATE LIMITED-CR"),
    ]);
    expect(result).toBeNull();
  });
});

describe("invoiceExtractionSchema", () => {
  it("accepts the invoice issuer's own bank details as nullable strings", () => {
    const result = invoiceExtractionSchema.safeParse({
      billNo: "INV-1",
      billDate: "2026-09-16",
      basicAmount: 10000,
      gstAmount: 1800,
      payeeName: "Businary Consultancy Services LLP",
      bankAccountNo: "0248274720",
      bankIfsc: "KKBK0001808",
      bankName: "Kotak Mahindra Bank",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null bank fields when the invoice has no bank details section", () => {
    const result = invoiceExtractionSchema.safeParse({
      billNo: "INV-1",
      billDate: "2026-09-16",
      basicAmount: 10000,
      gstAmount: 1800,
      payeeName: "Some Vendor",
      bankAccountNo: null,
      bankIfsc: null,
      bankName: null,
    });
    expect(result.success).toBe(true);
  });
});

describe("bankDetailsMismatch", () => {
  const systemAccount = { bankAccountNo: "0248274720", bankIfsc: "KKBK0001808" };

  it("is false when the invoice's printed details match the system record exactly", () => {
    expect(
      bankDetailsMismatch(systemAccount, { bankAccountNo: "0248274720", bankIfsc: "KKBK0001808" }),
    ).toBe(false);
  });

  it("is false when matching ignores whitespace and case differences", () => {
    expect(
      bankDetailsMismatch(systemAccount, { bankAccountNo: "0248 2747 20", bankIfsc: "kkbk0001808" }),
    ).toBe(false);
  });

  it("is true when the account number differs", () => {
    expect(
      bankDetailsMismatch(systemAccount, { bankAccountNo: "9999999999", bankIfsc: "KKBK0001808" }),
    ).toBe(true);
  });

  it("is true when the IFSC differs", () => {
    expect(
      bankDetailsMismatch(systemAccount, { bankAccountNo: "0248274720", bankIfsc: "HDFC0001234" }),
    ).toBe(true);
  });

  it("is false when the invoice didn't extract a bank details section at all — missing data is never a contradiction", () => {
    expect(bankDetailsMismatch(systemAccount, { bankAccountNo: null, bankIfsc: null })).toBe(false);
  });

  it("only compares the field the invoice actually extracted", () => {
    expect(
      bankDetailsMismatch(systemAccount, { bankAccountNo: null, bankIfsc: "HDFC0001234" }),
    ).toBe(true);
    expect(bankDetailsMismatch(systemAccount, { bankAccountNo: "0248274720", bankIfsc: null })).toBe(false);
  });
});

describe("invoiceBeneficiaryName (pre-PR #6 rule, no overwrite)", () => {
  const vendor = { companyName: "Pune Expo Services Pvt. Ltd." };

  it("is not set from a supplier name alone: the invoice must also print an account number or IFSC", () => {
    expect(invoiceBeneficiaryName({ payeeName: "Pune Expo Services" }, "")).toBeNull();
    expect(invoiceBeneficiaryName({ payeeName: "Pune Expo Services", vendor }, "")).toBeNull();
  });

  it("uses the matched vendor name over the raw invoice payee when bank details were printed", () => {
    expect(invoiceBeneficiaryName({ bankAccountNo: "50100012345678", payeeName: "PUNE EXPO", vendor }, "")).toBe("Pune Expo Services Pvt. Ltd.");
    expect(invoiceBeneficiaryName({ bankIfsc: "HDFC0001234", payeeName: "Pune Expo Services" }, null)).toBe("Pune Expo Services");
  });

  it("never overwrites what the submitter already typed", () => {
    expect(invoiceBeneficiaryName({ bankAccountNo: "50100012345678", payeeName: "Pune Expo Services" }, "R. Kulkarni")).toBeNull();
    expect(invoiceBeneficiaryName({ bankAccountNo: "50100012345678", payeeName: "Pune Expo Services" }, "   ")).toBe("Pune Expo Services");
  });

  it("returns null when there is no name to use", () => {
    expect(invoiceBeneficiaryName({ bankAccountNo: "50100012345678" }, "")).toBeNull();
  });
});

describe("PaymentAdviceForm wiring", () => {
  it("only fills Beneficiary Name through invoiceBeneficiaryName, with no payee-only fallback", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync("components/form/PaymentAdviceForm.tsx", "utf8");
    expect(source).toContain('invoiceBeneficiaryName(autoFill, getValues("beneficiaryName"))');
    expect(source).not.toContain('setValue("beneficiaryName", autoFill.payeeName');
  });
});
