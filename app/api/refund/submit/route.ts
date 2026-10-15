import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { refundSubmissions } from "@/lib/db/schema";
import { allocateRefundNumber, financialYearFor } from "@/lib/serial";
import { todayInIst } from "@/lib/date-time";
import { verifyUploadedAttachments } from "@/lib/attachments/verify-uploaded";
import { PENDING_UPLOAD_PREFIX } from "@/lib/attachments/client-upload";
import { MAX_OTHER_ATTACHMENTS } from "@/lib/validation/payment-advice";

export const runtime = "nodejs";

const documentSchema = z.object({
  type: z.enum(["EMAIL_COPY", "CANCELLED_CHEQUE", "OTHER"]),
  fileName: z.string().trim().min(1).max(255),
  blobPathname: z.string().startsWith(PENDING_UPLOAD_PREFIX).max(1024),
  blobUrl: z.string().url().max(2048),
  sizeBytes: z.number().int().positive().max(10 * 1024 * 1024),
});

const requestSchema = z.object({
  submittedByName: z.string().trim().min(1, "Your name is required").max(200),
  submittedByEmail: z.string().trim().email("Enter a valid email").max(320),
  submittedByDepartment: z.string().trim().min(1, "Your department is required").max(100),
  branch: z.enum(["SB Road Office", "Tilak Road Office", "Hadapsar Office", "Bhosari Office", "Ahilyanagar Office"]),
  recommendingAuthority: z.string().trim().min(1, "Recommending authority is required").max(200),
  payeeDetails: z.string().trim().min(1, "Payee / Company Name is required").max(2000),
  payeeAddress: z.string().trim().max(2000).optional().default(""),
  payeeContactPerson: z.string().trim().max(200).optional().default(""),
  payeeContactPhone: z.string().trim().max(30).optional().default(""),
  payeeEmail: z.union([z.string().trim().email("Enter a valid payee email").max(320), z.literal("")]).optional().default(""),
  payeeGstin: z.string().trim().max(15).optional().default(""),
  payeeUdyamNumber: z.string().trim().max(50).optional().default(""),
  basicAmount: z.number().finite().min(0).max(99_999_999.99),
  gstAmount: z.number().finite().min(0).max(99_999_999.99),
  natureOfExpenditure: z.string().trim().min(1, "Nature of expenditure is required").max(2000),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid From Date").refine((value) => value <= todayInIst(), "From Date cannot be in the future"),
  bankName: z.string().trim().max(200).optional().default(""),
  beneficiaryName: z.string().trim().max(200).optional().default(""),
  bankAccountNo: z.string().trim().max(50).optional().default(""),
  bankIfsc: z.string().trim().toUpperCase().max(20).optional().default(""),
  enclosures: z.string().trim().max(1000).optional().default(""),
  specialRemarks: z.string().trim().max(4000).optional().default(""),
  documents: z.array(documentSchema).max(2 + MAX_OTHER_ATTACHMENTS),
}).superRefine((value, context) => {
  if (Math.round((value.basicAmount + value.gstAmount) * 100) <= 0) {
    context.addIssue({ code: "custom", path: ["basicAmount"], message: "Enter a Basic Amount or GST Amount greater than zero." });
  }
  if (value.bankIfsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(value.bankIfsc)) {
    context.addIssue({ code: "custom", path: ["bankIfsc"], message: "Enter a valid IFSC code." });
  }
  const types = value.documents.filter((document) => document.type !== "OTHER").map((document) => document.type);
  if (new Set(types).size !== types.length) {
    context.addIssue({ code: "custom", path: ["documents"], message: "Only one file of each document type is allowed." });
  }
  if (value.documents.filter((document) => document.type === "OTHER").length > MAX_OTHER_ATTACHMENTS) {
    context.addIssue({ code: "custom", path: ["documents"], message: `Attach no more than ${MAX_OTHER_ATTACHMENTS} other documents.` });
  }
});

const asString = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
};

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production" && process.env.REFUND_REQUESTS_ENABLED !== "true") {
    return NextResponse.json({ error: "Refund requests are not enabled yet." }, { status: 404 });
  }
  const form = await request.formData();
  // Local development is deliberately a non-persistent preview until the
  // user approves the workflow and provides a development database.
  if (process.env.NODE_ENV !== "production" && asString(form, "previewOnly") === "true") {
    return NextResponse.json({ refundNo: "LOCAL PREVIEW ONLY", previewOnly: true });
  }

  let documents: unknown;
  try {
    documents = JSON.parse(asString(form, "documents") || "[]");
  } catch {
    return NextResponse.json({ error: "Document details are invalid." }, { status: 400 });
  }
  const parsed = requestSchema.safeParse({
    submittedByName: asString(form, "submittedByName"),
    submittedByEmail: asString(form, "submittedByEmail"),
    submittedByDepartment: asString(form, "submittedByDepartment"),
    branch: asString(form, "branch"),
    recommendingAuthority: asString(form, "recommendingAuthority"),
    payeeDetails: asString(form, "payeeDetails"),
    payeeAddress: asString(form, "payeeAddress"),
    payeeContactPerson: asString(form, "payeeContactPerson"),
    payeeContactPhone: asString(form, "payeeContactPhone"),
    payeeEmail: asString(form, "payeeEmail"),
    payeeGstin: asString(form, "payeeGstin"),
    payeeUdyamNumber: asString(form, "payeeUdyamNumber"),
    basicAmount: Number(asString(form, "basicAmount") || 0),
    gstAmount: Number(asString(form, "gstAmount") || 0),
    natureOfExpenditure: asString(form, "natureOfExpenditure"),
    fromDate: asString(form, "fromDate"),
    bankName: asString(form, "bankName"),
    beneficiaryName: asString(form, "beneficiaryName"),
    bankAccountNo: asString(form, "bankAccountNo"),
    bankIfsc: asString(form, "bankIfsc"),
    enclosures: asString(form, "enclosures"),
    specialRemarks: asString(form, "specialRemarks"),
    documents,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid refund details." }, { status: 400 });
  }

  const documentError = await verifyUploadedAttachments(parsed.data.documents, true);
  if (documentError) return NextResponse.json({ error: documentError }, { status: 400 });

  const values = parsed.data;
  const now = new Date();
  const financialYear = financialYearFor(now);
  const totalAmount = Math.round((values.basicAmount + values.gstAmount) * 100) / 100;
  try {
    const refundNo = await db.transaction(async (tx) => {
      const nextRefundNo = await allocateRefundNumber(tx, financialYear);
      await tx.insert(refundSubmissions).values({
        refundNo: nextRefundNo,
        financialYear,
        submittedByName: values.submittedByName,
        submittedByEmail: values.submittedByEmail,
        submittedByDepartment: values.submittedByDepartment,
        branch: values.branch,
        recommendingAuthority: values.recommendingAuthority,
        payeeDetails: values.payeeDetails,
        payeeAddress: values.payeeAddress || null,
        payeeContactPerson: values.payeeContactPerson || null,
        payeeContactPhone: values.payeeContactPhone || null,
        payeeEmail: values.payeeEmail || null,
        payeeGstin: values.payeeGstin || null,
        payeeUdyamNumber: values.payeeUdyamNumber || null,
        basicAmount: values.basicAmount.toFixed(2),
        gstAmount: values.gstAmount.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        natureOfExpenditure: values.natureOfExpenditure,
        fromDate: values.fromDate,
        bankName: values.bankName || null,
        beneficiaryName: values.beneficiaryName || null,
        bankAccountNo: values.bankAccountNo || null,
        bankIfsc: values.bankIfsc || null,
        enclosures: values.enclosures || null,
        specialRemarks: values.specialRemarks || null,
        documents: values.documents,
        submittedAt: now,
      });
      return nextRefundNo;
    });
    return NextResponse.json({ refundNo, previewOnly: false });
  } catch (error) {
    console.error("Refund submission failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not save the refund request. Check the database connection and try again." }, { status: 500 });
  }
}
