import { describe, expect, it } from "vitest";
import {
  groupUploadedAttachments,
  parseUploadedAttachments,
  validateAttachmentCounts,
} from "@/lib/attachments/client-upload";

const upload = (docType: "TAX_INVOICE" | "APPROVAL_BUDGET", fileName: string) => ({
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
});
