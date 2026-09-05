import { describe, expect, it } from "vitest";
import {
  groupUploadedAttachments,
  parseUploadedAttachments,
  validateAttachmentCounts,
} from "@/lib/attachments/client-upload";

const upload = (docType: "TAX_INVOICE" | "APPROVAL_BUDGET" | "OTHER" | "PURCHASE_ORDER" | "DELIVERY_CHALLAN", fileName: string) => ({
  docType,
  fileName,
  blobPathname: `pending-uploads/batch/${fileName}`,
  blobUrl: `https://store.private.blob.vercel-storage.com/pending-uploads/batch/${fileName}`,
  sizeBytes: 3_000_000,
});

describe("client-upload attachment metadata", () => {
  it("accepts multiple PDFs whose combined size exceeds 4.5 MB when each is below 10 MB", () => {
    const uploads = [upload("TAX_INVOICE", "invoice.pdf"), upload("APPROVAL_BUDGET", "approval.pdf")];
    const parsed = parseUploadedAttachments(JSON.stringify(uploads));
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) return;
    expect(parsed.attachments.reduce((sum, item) => sum + item.sizeBytes, 0)).toBe(6_000_000);
    expect(validateAttachmentCounts(groupUploadedAttachments(parsed.attachments), false)).toBeNull();
  });

  it("still rejects an individual file over 10 MB", () => {
    const tooLarge = { ...upload("TAX_INVOICE", "invoice.pdf"), sizeBytes: 10 * 1024 * 1024 + 1 };
    expect(parseUploadedAttachments(JSON.stringify([tooLarge]))).toEqual({
      error: "Attachment metadata is invalid.",
    });
  });

  it("allows an edit to retain existing mandatory attachments", () => {
    const grouped = groupUploadedAttachments([]);
    expect(
      validateAttachmentCounts(grouped, false, { TAX_INVOICE: 1, APPROVAL_BUDGET: 1 }),
    ).toBeNull();
  });

  it("requires only the Tax Invoice for a regular submission", () => {
    const parsed = parseUploadedAttachments(JSON.stringify([upload("TAX_INVOICE", "invoice.png")]));
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) return;
    expect(validateAttachmentCounts(groupUploadedAttachments(parsed.attachments), false)).toBeNull();
  });

  it("allows optional Other Documents for Payment Advice but not Cash Voucher", () => {
    const grouped = groupUploadedAttachments([
      upload("TAX_INVOICE", "invoice.pdf"),
      upload("OTHER", "supporting-document.pdf"),
    ]);
    expect(validateAttachmentCounts(grouped, false, undefined, "NEFT")).toBeNull();
    expect(validateAttachmentCounts(grouped, false, undefined, "CASH")).toContain(
      "available only for Payment Advice",
    );
  });

  it("keeps Approval / Budget Letter mandatory for Advance Payment", () => {
    expect(validateAttachmentCounts(groupUploadedAttachments([]), true)).toContain("mandatory");
  });

  it("allows Purchase Order and Delivery Challan on a regular Payment Advice (NEFT) — real bug, previously rejected these unconditionally for any non-advance submission", () => {
    const grouped = groupUploadedAttachments([
      upload("TAX_INVOICE", "invoice.pdf"),
      upload("PURCHASE_ORDER", "po.pdf"),
      upload("DELIVERY_CHALLAN", "challan.pdf"),
    ]);
    expect(validateAttachmentCounts(grouped, false, undefined, "NEFT")).toBeNull();
  });

  it("still blocks Purchase Order / Delivery Challan for Cash Voucher, which has no Bill & Reference section", () => {
    const grouped = groupUploadedAttachments([
      upload("TAX_INVOICE", "invoice.pdf"),
      upload("PURCHASE_ORDER", "po.pdf"),
    ]);
    expect(validateAttachmentCounts(grouped, false, undefined, "CASH")).toContain(
      "Only Tax Invoice / Supplementary Document and Approval / Budget Letter attachments are allowed.",
    );
  });

  it("still blocks Purchase Order / Delivery Challan for an Advance Payment, which has no Bill & Reference section either", () => {
    const grouped = groupUploadedAttachments([
      upload("APPROVAL_BUDGET", "approval.pdf"),
      upload("DELIVERY_CHALLAN", "challan.pdf"),
    ]);
    expect(validateAttachmentCounts(grouped, true, undefined, "NEFT")).toContain(
      "Only Tax Invoice / Supplementary Document and Approval / Budget Letter attachments are allowed.",
    );
  });
});
