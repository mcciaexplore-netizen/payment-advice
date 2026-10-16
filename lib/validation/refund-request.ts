import { z } from "zod";
import { PENDING_UPLOAD_PREFIX } from "@/lib/attachments/client-upload";
import { BRANCH_OPTIONS, GSTIN_RE, MAX_OTHER_ATTACHMENTS } from "@/lib/validation/payment-advice";

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_AMOUNT = 99_999_999.99;

const optionalText = (max: number) => z.string().trim().max(max).optional().default("");

export const REFUND_DOCUMENT_TYPES = ["EMAIL_COPY", "CANCELLED_CHEQUE", "OTHER"] as const;

export const refundDocumentSchema = z.object({
  type: z.enum(REFUND_DOCUMENT_TYPES),
  fileName: z.string().trim().min(1).max(255),
  blobPathname: z.string().startsWith(PENDING_UPLOAD_PREFIX).max(1024),
  blobUrl: z.string().url().max(2048),
  sizeBytes: z.number().int().positive().max(10 * 1024 * 1024),
});

const amount = (label: string) => z.number({ error: `Enter the ${label}` }).finite(`Enter the ${label}`)
  .min(0, `${label} cannot be negative`).max(MAX_AMOUNT, `${label} exceeds the supported limit`)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, `${label} can have at most 2 decimals`);

/** Builds the Refund request schema. `today` is the server's IST date, so
 * "From Date cannot be in the future" is judged against the same date that
 * is stored as request_date (and the DB's from_date <= request_date check). */
export function refundRequestSchema(today: string) {
  return z.object({
    submittedByName: z.string().trim().min(1, "Your name is required").max(200),
    submittedByEmail: z.string().trim().toLowerCase().email("Enter a valid email").max(320),
    submittedByDepartment: z.string().trim().min(1, "Your department is required").max(100),
    branch: z.enum(BRANCH_OPTIONS, { error: "Select your branch" }),
    recommendingAuthority: z.string().trim().min(1, "Recommending authority is required").max(200),
    payeeName: z.string().trim().min(1, "Payee / Company Name is required").max(2000),
    payeeAddress: optionalText(2000),
    payeeContactPerson: optionalText(200),
    payeeContactPhone: optionalText(30),
    payeeEmail: z.union([z.string().trim().email("Enter a valid payee email").max(320), z.literal("")]).optional().default(""),
    payeeGstin: z.union([z.string().trim().toUpperCase().regex(GSTIN_RE, "Enter a valid 15-character GSTIN"), z.literal("")]).optional().default(""),
    payeeUdyamNumber: optionalText(50),
    basicAmount: amount("Basic Amount"),
    gstAmount: amount("GST Amount"),
    natureOfExpenditure: z.string().trim().min(1, "Nature of expenditure is required").max(2000),
    fromDate: z.string().regex(ISO_DATE, "Enter a valid From Date").refine((value) => value <= today, "From Date cannot be in the future"),
    bankName: optionalText(200),
    beneficiaryName: optionalText(200),
    bankAccountNo: optionalText(50),
    bankIfsc: z.union([z.string().trim().toUpperCase().regex(IFSC_RE, "Enter a valid IFSC code"), z.literal("")]).optional().default(""),
    enclosures: optionalText(1000),
    specialRemarks: optionalText(4000),
    documents: z.array(refundDocumentSchema).max(2 + MAX_OTHER_ATTACHMENTS),
  }).superRefine((value, context) => {
    if (Math.round(value.basicAmount * 100) + Math.round(value.gstAmount * 100) <= 0) {
      context.addIssue({ code: "custom", path: ["basicAmount"], message: "Enter a Basic Amount or GST Amount greater than zero." });
    }
    const singleTypes = value.documents.filter((document) => document.type !== "OTHER").map((document) => document.type);
    if (new Set(singleTypes).size !== singleTypes.length) {
      context.addIssue({ code: "custom", path: ["documents"], message: "Only one file of each document type is allowed." });
    }
    if (value.documents.filter((document) => document.type === "OTHER").length > MAX_OTHER_ATTACHMENTS) {
      context.addIssue({ code: "custom", path: ["documents"], message: `Attach no more than ${MAX_OTHER_ATTACHMENTS} other documents.` });
    }
  });
}

export type RefundRequestInput = z.output<ReturnType<typeof refundRequestSchema>>;

/** Totals in paise so 0.1 + 0.2 style float error can never reach the DB's
 * total = basic + gst check. */
export function refundAmounts(input: Pick<RefundRequestInput, "basicAmount" | "gstAmount">) {
  const basic = Math.round(input.basicAmount * 100);
  const gst = Math.round(input.gstAmount * 100);
  return { basicAmount: (basic / 100).toFixed(2), gstAmount: (gst / 100).toFixed(2), totalAmount: ((basic + gst) / 100).toFixed(2) };
}
