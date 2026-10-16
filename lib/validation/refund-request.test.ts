import { describe, expect, it } from "vitest";
import { refundAmounts, refundRequestSchema } from "@/lib/validation/refund-request";

const TODAY = "2026-10-16";
const valid = {
  submittedByName: "Test Submitter",
  submittedByEmail: "Submitter@MCCIAPune.com",
  submittedByDepartment: "ADMIN",
  branch: "SB Road Office",
  recommendingAuthority: "Head Admin",
  payeeName: "Pune Expo Services Pvt. Ltd.",
  basicAmount: 1000.1,
  gstAmount: 180.2,
  natureOfExpenditure: "Refund of stall booking",
  fromDate: "2026-10-01",
  documents: [],
};
const parse = (overrides: Record<string, unknown>) => refundRequestSchema(TODAY).safeParse({ ...valid, ...overrides });
const firstError = (overrides: Record<string, unknown>) => {
  const result = parse(overrides);
  return result.success ? null : result.error.issues[0]?.message;
};

describe("refundRequestSchema", () => {
  it("accepts a minimal valid request, trims and normalises", () => {
    const result = parse({ payeeGstin: "27aaacm1234a1z5", bankIfsc: "hdfc0001234", submittedByName: "  Test Submitter  " });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.submittedByEmail).toBe("submitter@mcciapune.com");
    expect(result.data.payeeGstin).toBe("27AAACM1234A1Z5");
    expect(result.data.bankIfsc).toBe("HDFC0001234");
    expect(result.data.submittedByName).toBe("Test Submitter");
    expect(result.data.payeeAddress).toBe("");
  });

  it.each([
    [{ payeeName: "   " }, "Payee / Company Name is required"],
    [{ submittedByEmail: "not-an-email" }, "Enter a valid email"],
    [{ branch: "Mars Office" }, "Select your branch"],
    [{ basicAmount: 0, gstAmount: 0 }, "Enter a Basic Amount or GST Amount greater than zero."],
    [{ basicAmount: -5 }, "Basic Amount cannot be negative"],
    [{ gstAmount: 10.005 }, "GST Amount can have at most 2 decimals"],
    [{ basicAmount: 100_000_000 }, "Basic Amount exceeds the supported limit"],
    [{ fromDate: "2026-10-17" }, "From Date cannot be in the future"],
    [{ fromDate: "16-10-2026" }, "Enter a valid From Date"],
    [{ payeeGstin: "12345" }, "Enter a valid 15-character GSTIN"],
    [{ bankIfsc: "HDFC1234567" }, "Enter a valid IFSC code"],
    [{ payeeEmail: "nope" }, "Enter a valid payee email"],
  ])("rejects %o", (overrides, message) => {
    expect(firstError(overrides)).toBe(message);
  });

  it("allows From Date equal to today (the stored request_date)", () => {
    expect(parse({ fromDate: TODAY }).success).toBe(true);
  });

  it("limits documents: one Email copy, one Cancelled cheque, at most 3 Other, pending-upload paths only", () => {
    const doc = (type: string, n = 1) => ({ type, fileName: `${type}-${n}.pdf`, blobPathname: `pending-uploads/x/${type}-${n}.pdf`, blobUrl: "https://example.com/x", sizeBytes: 100 });
    expect(parse({ documents: [doc("EMAIL_COPY"), doc("CANCELLED_CHEQUE"), doc("OTHER", 1), doc("OTHER", 2), doc("OTHER", 3)] }).success).toBe(true);
    expect(firstError({ documents: [doc("EMAIL_COPY", 1), doc("EMAIL_COPY", 2)] })).toBe("Only one file of each document type is allowed.");
    expect(parse({ documents: [doc("OTHER", 1), doc("OTHER", 2), doc("OTHER", 3), doc("OTHER", 4)] }).success).toBe(false);
    expect(parse({ documents: [{ ...doc("OTHER"), blobPathname: "attachments/final.pdf" }] }).success).toBe(false);
  });
});

describe("refundAmounts", () => {
  it("adds in paise so the total always equals basic + gst exactly", () => {
    expect(refundAmounts({ basicAmount: 0.1, gstAmount: 0.2 })).toEqual({ basicAmount: "0.10", gstAmount: "0.20", totalAmount: "0.30" });
    expect(refundAmounts({ basicAmount: 1000.1, gstAmount: 180.2 })).toEqual({ basicAmount: "1000.10", gstAmount: "180.20", totalAmount: "1180.30" });
  });
});
