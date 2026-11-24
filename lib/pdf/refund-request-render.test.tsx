import { inflateSync } from "node:zlib";
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

// Text of each page, read from the renderer's own content streams (its
// built-in Helvetica emits ASCII text as hexadecimal TJ operands). Same
// helper as the Forwarding Memo render test; not a general PDF parser.
function pageTexts(buffer: Buffer): string[] {
  const pages: string[] = [];
  const source = buffer.toString("latin1");
  for (const match of source.matchAll(/<<([\s\S]*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    if (!match[1].includes("/FlateDecode")) continue;
    const stream = inflateSync(Buffer.from(match[2], "latin1")).toString("latin1");
    const lines: string[] = [];
    for (const operation of stream.matchAll(/\[([^\]]*)\]\s*TJ/g)) {
      lines.push(Array.from(operation[1].matchAll(/<([\da-f]+)>/gi), (text) =>
        Buffer.from(text[1], "hex").toString("latin1"),
      ).join(""));
    }
    // React-pdf writes one text content stream per page; image streams have
    // no TJ operators and are excluded.
    if (lines.length) pages.push(lines.join("\n").replace(/\s+/g, " ").trim());
  }
  return pages;
}

const typical = {
  serialNo: "REF/MCCIA/2026-27/0007", requestDate: "2026-11-17", submittedByName: "Sandhya Acharya", submittedByEmail: "sandhyaa@mcciapune.com",
  submittedByDepartment: "CBP", branch: "SB Road Office", recommendingAuthority: "ANIRUDDHA BRAHMA", payeeName: "Deccan Mechanical",
  payeeAddress: null, payeeContactPerson: null, payeeContactPhone: null, payeeEmail: null, payeeGstin: null, payeeUdyamNumber: null,
  basicAmount: "4000.00", gstAmount: "720.00", totalAmount: "4720.00", natureOfExpenditure: "Refund of participation fee", fromDate: "2026-11-01",
  bankName: "HDFC Bank", beneficiaryName: "Deccan Mechanical", bankAccountNo: "50200012345678", bankIfsc: "HDFC0001234",
  enclosures: null, specialRemarks: null, documents: [],
};

describe("Refund request PDF stamp", () => {
  it("stamps the Submitted by box with the submitter's name and the request date, like the Cash Payment Voucher", async () => {
    const text = pageTexts(await renderRefundRequestPdf(typical)).join(" ");
    expect(text).toContain("SUBMITTED Sandhya Acharya 17/11/2026");
    expect(text.match(/SUBMITTED/g)).toHaveLength(1);
  }, 20000);

  it("does not stamp Recommended by or Accounts Department (a refund has no approval step, and Accounts signs by hand)", async () => {
    const text = pageTexts(await renderRefundRequestPdf(typical)).join(" ");
    expect(text).not.toContain("RECOMMENDED");
    expect(text).toContain("Recommended by ANIRUDDHA BRAHMA");
    expect(text).toContain("Accounts Department");
  }, 20000);

  it("the stamp adds no height: a typical refund still fits on one page", async () => {
    expect(pageTexts(await renderRefundRequestPdf(typical))).toHaveLength(1);
  }, 20000);
});

describe("Refund request PDF: Recommended by stamp", () => {
  it("stamps Recommended by (name and date, in the authority's own box) once the authority has recommended it", async () => {
    const text = pageTexts(await renderRefundRequestPdf({ ...typical, recommendedBy: "Aniruddha Brahma", recommendedAt: new Date("2026-11-24T10:00:00Z") })).join(" ");
    expect(text).toContain("RECOMMENDED Aniruddha Brahma 24/11/2026");
    expect(text).toContain("SUBMITTED Sandhya Acharya 17/11/2026");
    expect(text.match(/RECOMMENDED/g)).toHaveLength(1);
    expect(text.match(/SUBMITTED/g)).toHaveLength(1);
  }, 20000);

  it("falls back to the authority's name on the form when the recommender's name is not given", async () => {
    const text = pageTexts(await renderRefundRequestPdf({ ...typical, recommendedAt: "2026-11-24T10:00:00Z" })).join(" ");
    expect(text).toContain("RECOMMENDED ANIRUDDHA BRAHMA 24/11/2026");
  }, 20000);

  it("a refund that is not yet recommended (or was sent back) has no Recommended stamp, and the stamps add no height", async () => {
    const pages = pageTexts(await renderRefundRequestPdf({ ...typical, recommendedBy: null, recommendedAt: null }));
    expect(pages.join(" ")).not.toContain("RECOMMENDED");
    expect(pages).toHaveLength(1);
    expect(pageTexts(await renderRefundRequestPdf({ ...typical, recommendedBy: "A", recommendedAt: new Date() }))).toHaveLength(1);
  }, 20000);
});
