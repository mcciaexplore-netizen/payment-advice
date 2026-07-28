import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { put, del } from "@vercel/blob";
import { db } from "@/lib/db";
import { paymentAdvices, attachments, auditLog } from "@/lib/db/schema";
import { parsePaymentAdviceFormData } from "@/lib/form-data";
import {
  paymentAdviceFormSchema,
  MAX_FILE_SIZE_BYTES,
  MAX_OTHER_ATTACHMENTS,
  DocType,
} from "@/lib/validation/payment-advice";

export const runtime = "nodejs";

const PDF_MAGIC = "%PDF-";
const DOC_TYPES: DocType[] = [
  "TAX_INVOICE",
  "APPROVAL_BUDGET",
  "PURCHASE_ORDER",
  "DELIVERY_CHALLAN",
  "OTHER",
];

async function looksLikePdf(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  return new TextDecoder().decode(head) === PDF_MAGIC;
}

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

async function collectNewAttachments(
  formData: FormData,
): Promise<{ error: string } | { byDocType: Record<DocType, File[]> }> {
  const byDocType = {
    TAX_INVOICE: formData.getAll("attachment_TAX_INVOICE") as File[],
    APPROVAL_BUDGET: formData.getAll("attachment_APPROVAL_BUDGET") as File[],
    PURCHASE_ORDER: formData.getAll("attachment_PURCHASE_ORDER") as File[],
    DELIVERY_CHALLAN: formData.getAll("attachment_DELIVERY_CHALLAN") as File[],
    OTHER: formData.getAll("attachment_OTHER") as File[],
  } satisfies Record<DocType, File[]>;

  if (byDocType.TAX_INVOICE.length > 1) return { error: "Only one Tax Invoice file is allowed." };
  if (byDocType.APPROVAL_BUDGET.length > 1)
    return { error: "Only one Approval / Budget Letter file is allowed." };
  if (byDocType.PURCHASE_ORDER.length > 1) return { error: "Only one Purchase Order file is allowed." };
  if (byDocType.DELIVERY_CHALLAN.length > 1)
    return { error: "Only one Delivery Challan file is allowed." };
  if (byDocType.OTHER.length > MAX_OTHER_ATTACHMENTS)
    return { error: `At most ${MAX_OTHER_ATTACHMENTS} "Other" files are allowed.` };

  for (const files of Object.values(byDocType)) {
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return { error: `"${file.name}" is larger than 10 MB.` };
      }
      if (!(await looksLikePdf(file))) {
        return { error: `"${file.name}" is not a valid PDF file.` };
      }
    }
  }

  return { byDocType };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const [advice] = await db
    .select()
    .from(paymentAdvices)
    .where(eq(paymentAdvices.editToken, token))
    .limit(1);

  if (
    !advice ||
    advice.status !== "SENT_BACK" ||
    !advice.editTokenExpiresAt ||
    advice.editTokenExpiresAt < new Date()
  ) {
    return NextResponse.json(
      { error: "This edit link is no longer valid. Please contact Accounts." },
      { status: 410 },
    );
  }

  const formData = await req.formData();

  const parsed = paymentAdviceFormSchema.safeParse(parsePaymentAdviceFormData(formData));

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid form data" },
      { status: 400 },
    );
  }
  const values = parsed.data;

  const attachmentResult = await collectNewAttachments(formData);
  if ("error" in attachmentResult) {
    return NextResponse.json({ error: attachmentResult.error }, { status: 400 });
  }
  const { byDocType } = attachmentResult;

  const existingAttachments = await db
    .select()
    .from(attachments)
    .where(eq(attachments.paymentAdviceId, advice.id));
  const existingByDocType = new Map<DocType, typeof existingAttachments>();
  for (const a of existingAttachments) {
    const docType = a.docType as DocType;
    const list = existingByDocType.get(docType) ?? [];
    list.push(a);
    existingByDocType.set(docType, list);
  }

  const hasTaxInvoice =
    byDocType.TAX_INVOICE.length === 1 || (existingByDocType.get("TAX_INVOICE")?.length ?? 0) > 0;
  const hasApprovalBudget =
    byDocType.APPROVAL_BUDGET.length === 1 ||
    (existingByDocType.get("APPROVAL_BUDGET")?.length ?? 0) > 0;
  if (!hasTaxInvoice) {
    return NextResponse.json(
      { error: "Tax Invoice is a mandatory attachment (exactly one PDF)." },
      { status: 400 },
    );
  }
  if (!hasApprovalBudget) {
    return NextResponse.json(
      { error: "Approval / Budget Letter is a mandatory attachment (exactly one PDF)." },
      { status: 400 },
    );
  }

  const uploadedPathnames: string[] = [];
  try {
    const newAttachmentRecords: {
      docType: DocType;
      fileName: string;
      blobPathname: string;
      blobUrl: string;
      sizeBytes: number;
    }[] = [];

    for (const docType of DOC_TYPES) {
      for (const file of byDocType[docType]) {
        const pathname = `advices/${advice.serialNo}/${docType}-${file.name}`;
        const blob = await put(pathname, file, {
          access: "public",
          contentType: "application/pdf",
        });
        uploadedPathnames.push(blob.pathname);
        newAttachmentRecords.push({
          docType,
          fileName: file.name,
          blobPathname: blob.pathname,
          blobUrl: blob.url,
          sizeBytes: file.size,
        });
      }
    }

    const now = new Date();
    const oldBlobPathnamesToDelete: string[] = [];

    await db.transaction(async (tx) => {
      await tx
        .update(paymentAdvices)
        .set({
          formDate: values.formDate,
          vendorId: values.vendorId ?? null,
          payeeName: values.payeeName,
          payeeAddress: values.payeeAddress,
          payeeEmail: values.payeeEmail ?? null,
          payeeContactPerson: values.payeeContactPerson ?? null,
          payeeContactPhone: values.payeeContactPhone ?? null,
          payeeGstin: values.payeeGstin ?? null,
          payeeUdyamNumber: values.payeeUdyamNumber ?? null,
          poNumber: values.poNumber ?? null,
          poDate: values.poDate ?? null,
          deliveryChallanNo: values.deliveryChallanNo ?? null,
          deliveryChallanDate: values.deliveryChallanDate ?? null,
          billNo: values.billNo,
          billDate: values.billDate,
          amount: values.amount.toFixed(2),
          natureOfExpenditure: values.natureOfExpenditure,
          enclosures: values.enclosures ?? null,
          specialRemarks: values.specialRemarks ?? null,
          paymentMode: values.paymentMode,
          bankAccountNo: values.bankAccountNo ?? null,
          bankIfsc: values.bankIfsc ?? null,
          beneficiaryName: values.beneficiaryName ?? null,
          submittedByName: values.submittedByName,
          submittedByEmail: values.submittedByEmail,
          submittedByDepartment: values.submittedByDepartment,
          recommendingAuthorityId: values.recommendingAuthorityId,
          verifiedByName: values.verifiedByName,
          sanctionedByName: values.sanctionedByName,
          status: "SUBMITTED",
          revisionCount: advice.revisionCount + 1,
          editToken: null,
          editTokenExpiresAt: null,
          updatedAt: now,
        })
        .where(eq(paymentAdvices.id, advice.id));

      for (const docType of DOC_TYPES) {
        if (byDocType[docType].length === 0) continue;
        const oldOnes = existingByDocType.get(docType) ?? [];
        if (oldOnes.length === 0) continue;
        oldBlobPathnamesToDelete.push(...oldOnes.map((o) => o.blobPathname));
        await tx
          .delete(attachments)
          .where(and(eq(attachments.paymentAdviceId, advice.id), eq(attachments.docType, docType)));
      }

      if (newAttachmentRecords.length > 0) {
        await tx.insert(attachments).values(
          newAttachmentRecords.map((a) => ({
            paymentAdviceId: advice.id,
            docType: a.docType,
            fileName: a.fileName,
            blobPathname: a.blobPathname,
            blobUrl: a.blobUrl,
            sizeBytes: a.sizeBytes,
          })),
        );
      }

      await tx.insert(auditLog).values({
        paymentAdviceId: advice.id,
        action: "RESUBMITTED",
        actor: values.submittedByName,
        ipAddress: clientIp(req),
        details: { serialNo: advice.serialNo, revisionCount: advice.revisionCount + 1 },
      });
    });

    await Promise.allSettled(oldBlobPathnamesToDelete.map((p) => del(p)));

    return NextResponse.json({ serialNo: advice.serialNo, id: advice.id });
  } catch (err) {
    console.error("Resubmit failed after blob upload, cleaning up", err);
    await Promise.allSettled(uploadedPathnames.map((p) => del(p)));
    return NextResponse.json(
      { error: "Something went wrong while saving your resubmission. Please try again." },
      { status: 500 },
    );
  }
}
