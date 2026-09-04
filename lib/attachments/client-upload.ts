import { z } from "zod";
import {
  DOC_TYPES,
  MAX_FILE_SIZE_BYTES,
  MAX_OTHER_ATTACHMENTS,
  type DocType,
} from "@/lib/validation/payment-advice";

export const PENDING_UPLOAD_PREFIX = "pending-uploads/";

export const uploadedAttachmentSchema = z.object({
  docType: z.enum(DOC_TYPES),
  fileName: z.string().trim().min(1).max(255),
  blobPathname: z.string().startsWith(PENDING_UPLOAD_PREFIX).max(1024),
  blobUrl: z.string().url().max(2048),
  sizeBytes: z.number().int().positive().max(MAX_FILE_SIZE_BYTES),
});

export type UploadedAttachment = z.infer<typeof uploadedAttachmentSchema>;

export function parseUploadedAttachments(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return { error: "Attachment metadata is missing." } as const;
  try {
    const parsed = z.array(uploadedAttachmentSchema).safeParse(JSON.parse(value));
    if (!parsed.success) return { error: "Attachment metadata is invalid." } as const;
    return { attachments: parsed.data } as const;
  } catch {
    return { error: "Attachment metadata is invalid." } as const;
  }
}

export function groupUploadedAttachments(uploads: UploadedAttachment[]) {
  const byDocType: Record<DocType, UploadedAttachment[]> = {
    TAX_INVOICE: [],
    APPROVAL_BUDGET: [],
    PURCHASE_ORDER: [],
    DELIVERY_CHALLAN: [],
    OTHER: [],
  };
  for (const upload of uploads) byDocType[upload.docType].push(upload);
  return byDocType;
}

export function validateAttachmentCounts(
  byDocType: Record<DocType, UploadedAttachment[]>,
  isAdvance: boolean,
  existingCounts?: Partial<Record<DocType, number>>,
): string | null {
  if (byDocType.TAX_INVOICE.length > 1) return "Only one Tax Invoice file is allowed.";
  if (byDocType.APPROVAL_BUDGET.length > 1)
    return "Only one Approval / Budget Letter file is allowed.";
  if (byDocType.PURCHASE_ORDER.length > 1) return "Only one Purchase Order file is allowed.";
  if (byDocType.DELIVERY_CHALLAN.length > 1)
    return "Only one Delivery Challan file is allowed.";
  if (byDocType.OTHER.length > MAX_OTHER_ATTACHMENTS)
    return `At most ${MAX_OTHER_ATTACHMENTS} "Other" files are allowed.`;

  if (!isAdvance && byDocType.TAX_INVOICE.length === 0 && !existingCounts?.TAX_INVOICE)
    return "Tax Invoice is a mandatory attachment (exactly one PDF).";
  if (byDocType.APPROVAL_BUDGET.length === 0 && !existingCounts?.APPROVAL_BUDGET)
    return "Approval / Budget Letter is a mandatory attachment (exactly one PDF).";
  return null;
}

export function safeUploadFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "document.pdf";
}
