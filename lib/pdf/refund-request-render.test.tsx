import { describe, expect, it } from "vitest";
import { renderRefundRequestPdf } from "@/lib/pdf/render-refund-request";

describe("renderRefundRequestPdf", () => {
  it("renders a real PDF from a saved row, including optional sections", async () => {
    const buffer = await renderRefundRequestPdf({
      serialNo: "REF/MCCIA/2026-27/0001", requestDate: "2026-10-16", submittedByName: "Test Submitter", submittedByEmail: "t@example.com",
      submittedByDepartment: "ADMIN", branch: "SB Road Office", recommendingAuthority: "Head Admin", payeeName: "Pune Expo Services",
      payeeAddress: "Pune", payeeContactPerson: null, payeeContactPhone: null, payeeEmail: null, payeeGstin: "27AAACM1234A1Z5", payeeUdyamNumber: null,
      basicAmount: "1000.10", gstAmount: "180.20", totalAmount: "1180.30", natureOfExpenditure: "Refund of stall booking", fromDate: "2026-10-01",
      bankName: "HDFC Bank", beneficiaryName: "Pune Expo Services", bankAccountNo: "1234567890", bankIfsc: "HDFC0001234",
      enclosures: null, specialRemarks: "Cancelled stall", documents: [{ type: "CANCELLED_CHEQUE", fileName: "cheque.jpg" }],
    });
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(2000);
  }, 20000);
});
