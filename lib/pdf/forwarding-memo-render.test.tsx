import { inflateSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderForwardingMemoPdf } from "@/lib/pdf/render-forwarding-memo";
import type { ForwardingMemoInput } from "@/lib/validation/forwarding-memo";

const fixture: ForwardingMemoInput = {
  memoDate: "2026-09-17",
  partyName: "Sample Engineering Private Limited",
  partyAddress: "42 Sample Road\nPune 411016",
  purpose: "Membership subscription for the annual programme.",
  billNo: "SAMPLE/2026/001",
  billDate: "2026-09-10",
  instrumentMode: "CHEQUE",
  instrumentNo: "001234",
  instrumentDate: "2026-09-15",
  drawnOnBank: "Sample Bank, Pune Branch",
  amount: 123456.78,
  submittedByName: "Sample Staff Member",
};

// Read text from this renderer's real, in-memory PDF content streams. Its
// built-in Helvetica font emits ASCII text as hexadecimal TJ operands. This
// intentionally is not a general-purpose PDF parser or a production utility.
function renderedPages(buffer: Buffer): string[] {
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

function renderedText(buffer: Buffer): string {
  return renderedPages(buffer).join(" ");
}

function pageCount(buffer: Buffer) {
  return Array.from(buffer.toString("latin1").matchAll(/\/Type \/Page\b/g)).length;
}

afterEach(() => vi.restoreAllMocks());

describe("Forwarding Memo PDF foundation", () => {
  it("renders a one-page paper memo with distinct bill and instrument dates and blank physical signatures", async () => {
    const buffer = await renderForwardingMemoPdf(fixture);
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pageCount(buffer)).toBe(1);
    const text = renderedText(buffer);
    expect(text).toContain("Forwarding Memo");
    expect(text).toContain("The Chief Accountant");
    expect(text).toContain("Please accept the enclosed Cheque / D. D. and issue a receipt as per the details given below :-");
    expect(text).toContain("Date : 17/09/2026");
    expect(text).toContain("SAMPLE/2026/001 / 10/09/2026");
    expect(text).toContain("Cheque : 001234");
    expect(text).toContain("Dt. : 15/09/2026");
    expect(text).toContain("Sample Bank, Pune Branch");
    expect(text).toContain("1,23,456.78");
    expect(text).toContain("Received the above instrument for Accounts Department Signature");
    expect(text).toContain("Submitted by Sample Staff Member SUBMITTED Sample Staff Member 17/09/2026 Name & Signature");
    expect(text).toContain("SUBMITTED Sample Staff Member 17/09/2026");
    expect(text).not.toMatch(/RECOMMENDED|VERIFIED|APPROVED|MCCIA\/\d{4}/);
  });

  it("prints demand draft mode and leaves optional bill references blank", async () => {
    const buffer = await renderForwardingMemoPdf({ ...fixture, instrumentMode: "DD", billNo: undefined, billDate: undefined });
    const text = renderedText(buffer);
    expect(text).toContain("D.D. : 001234");
    expect(text).not.toContain("SAMPLE/2026/001");
    expect(text).not.toContain("10/09/2026");
    expect(text).not.toMatch(/undefined|null|Invalid Date/);
    expect(text).toContain("Dt. : 15/09/2026");
  });

  it("flows long content to additional pages without losing the final text or signature areas", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const longToken = "W".repeat(192);
    const buffer = await renderForwardingMemoPdf({
      ...fixture,
      partyAddress: `${longToken}\n${fixture.partyAddress}`,
      purpose: `${"Detailed purpose and supporting context. ".repeat(180)}FINAL PURPOSE MARKER`,
      submittedByName: "W".repeat(200),
    });
    expect(pageCount(buffer)).toBeGreaterThan(1);
    const text = renderedText(buffer);
    expect(text.replace(/\s/g, "")).toContain(longToken);
    expect(text).toContain("FINAL PURPOSE MARKER");
    expect(text).toContain("Received the above instrument for Accounts Department Signature");
    expect(text.replace(/\s/g, "")).toContain("W".repeat(200));
    expect(text).toContain("Name & Signature");
    const pages = renderedPages(buffer);
    expect(pages).toHaveLength(pageCount(buffer));
    const billPage = pages.find((page) => page.includes("Against our Bill No. / Date"));
    expect(billPage).toContain("SAMPLE/2026/001 / 10/09/2026");
    expect(warn.mock.calls.flat().join(" ")).not.toMatch(/exceed|overflow|larger than|cannot wrap/i);
  });
});
