import { inflateSync } from "node:zlib";
import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import { CashVoucherDocument, type CashVoucherPdfData } from "@/lib/pdf/CashVoucherDocument";

// Reads the real PDF the voucher produces: the text of each page and every font
// size used (same technique as the Forwarding Memo and Refund render tests; not a
// general PDF parser).
function streams(buffer: Buffer): string[] {
  const out: string[] = [];
  for (const match of buffer.toString("latin1").matchAll(/<<([\s\S]*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    if (match[1].includes("/FlateDecode")) out.push(inflateSync(Buffer.from(match[2], "latin1")).toString("latin1"));
  }
  return out;
}
function pageTexts(buffer: Buffer): string[] {
  return streams(buffer)
    .map((stream) =>
      Array.from(stream.matchAll(/\[([^\]]*)\]\s*TJ/g), (operation) =>
        Array.from(operation[1].matchAll(/<([\da-f]+)>/gi), (text) => Buffer.from(text[1], "hex").toString("latin1")).join(""),
      ).join("\n").replace(/\s+/g, " ").trim(),
    )
    .filter(Boolean);
}
function fontSizes(buffer: Buffer): Set<number> {
  const sizes = new Set<number>();
  for (const stream of streams(buffer)) for (const match of stream.matchAll(/\/F\d+\s+([\d.]+)\s+Tf/g)) sizes.add(Number(match[1]));
  return sizes;
}

const base: CashVoucherPdfData = {
  displayNo: "CASH/MCCIA/2026-27/0106", formDate: "2026-11-24", branch: "SB Road Office", payeeName: "Prashant Jogalekar",
  items: [], submittedByName: "Prashant Jogalekar", submittedAt: "2026-11-24T05:00:00Z", recommendingAuthorityName: "ANIRUDDHA BRAHMA",
  authorityApprovedAt: "2026-11-25T05:00:00Z", sanctionedBy: null, isAdvance: false, purposeOfAdvance: null,
  previousPendingAdvanceAmount: null, previousPendingAdvanceSince: null,
};
const typical: CashVoucherPdfData = {
  ...base,
  items: [
    { billDate: "2026-11-20", billNo: "B-1042", description: "Taxi fare to client site", amount: "214.00" },
    { billDate: "2026-11-21", billNo: "B-1051", description: "Stationery for the workshop", amount: "640.00" },
    { billDate: "2026-11-22", billNo: "INV/88", description: "Refreshments for guests", amount: "1250.00" },
  ],
};
const long = "Local conveyance and refreshments for the Family Business Forum workshop held at the chamber, including auto fare and tea snacks for guests";
const heavy: CashVoucherPdfData = {
  ...base,
  items: Array.from({ length: 10 }, (_, index) => ({ billDate: `2026-11-${10 + index}`, billNo: `BILL/2026/${1000 + index}`, description: `${long} (${index + 1})`, amount: String((index + 1) * 315.5) })),
};
const advance: CashVoucherPdfData = {
  ...base, displayNo: "ADV/2026-27/0003", isAdvance: true, purposeOfAdvance: "Advance for the Pune Expo stall setup",
  previousPendingAdvanceAmount: "5000.00", previousPendingAdvanceSince: "2026-10-01",
  items: [{ description: "Stall fabrication", amount: "15000.00" }, { description: "Transport of material", amount: "4500.00" }],
};
const render = (data: CashVoucherPdfData) => renderToBuffer(<CashVoucherDocument data={data} />);

describe("Cash Payment Voucher PDF text size", () => {
  it("prints the table, headings and signature boxes at a larger size than before", async () => {
    const sizes = fontSizes(await render(typical));
    // Table body 10.5, table headings and box labels 10, body 11, payee 15, title 22.
    for (const size of [10, 10.5, 11, 15, 22]) expect(sizes.has(size)).toBe(true);
    // The old sizes (7.5 table/labels, 18 title) are gone. The stamps keep their own small sizes.
    expect(sizes.has(7.5)).toBe(false);
    expect(sizes.has(18)).toBe(false);
  }, 30000);

  it("a typical voucher still fits on one page, with all its content", async () => {
    const pages = pageTexts(await render(typical));
    expect(pages).toHaveLength(1);
    const text = pages[0];
    expect(text).toContain("CASH PAYMENT VOUCHER");
    expect(text).toContain("NATURE OF EXPENDITURE");
    expect(text).toContain("Taxi fare to client site");
    expect(text).toContain("2,104.00");
    expect(text).toContain("SUBMITTED Prashant Jogalekar 24/11/2026");
    expect(text).toContain("RECOMMENDED ANIRUDDHA BRAHMA 25/11/2026");
    for (const label of ["Submitted by", "Recommended by", "Sanctioned by", "Payee's Signature"]) expect(text).toContain(label);
  }, 30000);

  it("an advance voucher is larger too and still one page, with its purpose and pending advance", async () => {
    const buffer = await render(advance);
    const pages = pageTexts(buffer);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toContain("PURPOSE OF ADVANCE");
    expect(pages[0]).toContain("Advance for the Pune Expo stall setup");
    expect(pages[0]).toContain("Previous Pending Advance : Rs. 5,000.00 (since 01/10/2026)");
    expect(pages[0]).toContain("19,500.00");
    expect(fontSizes(buffer).has(7.5)).toBe(false);
  }, 30000);

  it("a very long voucher (10 long lines) runs onto a second page without losing a line, the total or the signature boxes", async () => {
    const pages = pageTexts(await render(heavy));
    expect(pages.length).toBeGreaterThanOrEqual(2);
    const all = pages.join(" ");
    for (let index = 1; index <= 10; index += 1) expect(all).toContain(`(${index})`);
    expect(all).toContain("17,352.50"); // the total
    expect(all.match(/TOTAL/g)).toHaveLength(1);
    expect(all.match(/Sanctioned by/g)).toHaveLength(1);
    // The four signature boxes (and their stamps) stay together on one page, not split across two.
    const signaturePages = pages.filter((page) => page.includes("Submitted by"));
    expect(signaturePages).toHaveLength(1);
    for (const label of ["Recommended by", "Sanctioned by", "Payee's Signature", "SUBMITTED Prashant Jogalekar", "RECOMMENDED ANIRUDDHA BRAHMA"]) expect(signaturePages[0]).toContain(label);
  }, 30000);
});
