import { NextRequest, NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { paymentAdvices, attachments, auditLog, cashVoucherItems, recommendingAuthorities } from "@/lib/db/schema";
import { notifyAuthorityApproval, notifySubmissionConfirmation } from "@/lib/email/notify";
import { generateAuthorityToken } from "@/lib/advice/authority-token";
import { displayNoFor, documentLabelFor } from "@/lib/advice/document-identity";
import { allocateCashVoucherNumber, allocateSerialNumber } from "@/lib/serial";
import { parsePaymentAdviceFormData } from "@/lib/form-data";
import {
  paymentAdviceFormSchema,
  MAX_FILE_SIZE_BYTES,
  MAX_OTHER_ATTACHMENTS,
  DocType,
} from "@/lib/validation/payment-advice";

export const runtime = "nodejs";

const PDF_MAGIC = "%PDF-";

async function looksLikePdf(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  return new TextDecoder().decode(head) === PDF_MAGIC;
}

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

type AttachmentInput = { docType: DocType; file: File };

/** Validates presence/count rules and, for every file, size + real PDF content. */
async function validateAttachments(
  formData: FormData,
): Promise<{ error: string } | { attachments: AttachmentInput[] }> {
  const taxInvoice = formData.getAll("attachment_TAX_INVOICE") as File[];
  const approvalBudget = formData.getAll("attachment_APPROVAL_BUDGET") as File[];
  const purchaseOrder = formData.getAll("attachment_PURCHASE_ORDER") as File[];
  const deliveryChallan = formData.getAll("attachment_DELIVERY_CHALLAN") as File[];
  const other = formData.getAll("attachment_OTHER") as File[];

  if (taxInvoice.length !== 1) {
    return { error: "Tax Invoice is a mandatory attachment (exactly one PDF)." };
  }
  if (approvalBudget.length !== 1) {
    return { error: "Approval / Budget Letter is a mandatory attachment (exactly one PDF)." };
  }
  if (purchaseOrder.length > 1) {
    return { error: "Only one Purchase Order file is allowed." };
  }
  if (deliveryChallan.length > 1) {
    return { error: "Only one Delivery Challan file is allowed." };
  }
  if (other.length > MAX_OTHER_ATTACHMENTS) {
    return { error: `At most ${MAX_OTHER_ATTACHMENTS} "Other" files are allowed.` };
  }

  const inputs: AttachmentInput[] = [
    ...taxInvoice.map((file) => ({ docType: "TAX_INVOICE" as const, file })),
    ...approvalBudget.map((file) => ({ docType: "APPROVAL_BUDGET" as const, file })),
    ...purchaseOrder.map((file) => ({ docType: "PURCHASE_ORDER" as const, file })),
    ...deliveryChallan.map((file) => ({ docType: "DELIVERY_CHALLAN" as const, file })),
    ...other.map((file) => ({ docType: "OTHER" as const, file })),
  ];

  for (const { file } of inputs) {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return { error: `"${file.name}" is larger than 10 MB.` };
    }
    if (!(await looksLikePdf(file))) {
      return { error: `"${file.name}" is not a valid PDF file.` };
    }
  }

  return { attachments: inputs };
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();

  const parsed = paymentAdviceFormSchema.safeParse(parsePaymentAdviceFormData(formData));

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid form data" },
      { status: 400 },
    );
  }
  const values = parsed.data;

  const attachmentResult = await validateAttachments(formData);
  if ("error" in attachmentResult) {
    return NextResponse.json({ error: attachmentResult.error }, { status: 400 });
  }
  const attachmentInputs = attachmentResult.attachments;

  const now = new Date();
  let serialNo: string;
  let financialYear: string;
  let cashVoucherNo: string | null;
  try {
    ({ serialNo, financialYear, cashVoucherNo } = await db.transaction(async (tx) => {
      const allocated = await allocateSerialNumber(tx, now);
      const voucherNo =
        values.paymentMode === "CASH"
          ? await allocateCashVoucherNumber(tx, allocated.financialYear)
          : null;
      return { ...allocated, cashVoucherNo: voucherNo };
    }));
  } catch (err) {
    console.error("Failed to allocate serial number", err);
    return NextResponse.json(
      { error: "Could not allocate a serial number. Please try again." },
      { status: 500 },
    );
  }

  const uploadedPathnames: string[] = [];
  try {
    const attachmentRecords: {
      docType: DocType;
      fileName: string;
      blobPathname: string;
      blobUrl: string;
      sizeBytes: number;
    }[] = [];
    for (const { docType, file } of attachmentInputs) {
      const pathname = `advices/${serialNo}/${docType}-${file.name}`;
      // See app/api/edit/[token]/route.ts — same deterministic-path
      // collision risk exists here in principle (e.g. a retried request),
      // so the same addRandomSuffix fix applies for consistency.
      const blob = await put(pathname, file, {
        access: "private",
        contentType: "application/pdf",
        addRandomSuffix: true,
      });
      uploadedPathnames.push(blob.pathname);
      attachmentRecords.push({
        docType,
        fileName: file.name,
        blobPathname: blob.pathname,
        blobUrl: blob.url,
        sizeBytes: file.size,
      });
    }

    const { token: authorityToken, expiresAt: authorityTokenExpiresAt } = generateAuthorityToken();

    const adviceId = await db.transaction(async (tx) => {
      const [advice] = await tx
        .insert(paymentAdvices)
        .values({
          serialNo,
          financialYear,
          cashVoucherNo,
          status: "SUBMITTED",
          authorityToken,
          authorityTokenExpiresAt,
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
          basicAmount: values.paymentMode === "NEFT" ? values.basicAmount!.toFixed(2) : null,
          gstAmount: values.paymentMode === "NEFT" ? values.gstAmount!.toFixed(2) : null,
          natureOfExpenditure:
            values.paymentMode === "CASH"
              ? values.cashVoucherItems.map((item) => item.description).join("; ")
              : values.natureOfExpenditure ?? "",
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
          submittedAt: now,
        })
        .returning();

      await tx.insert(attachments).values(
        attachmentRecords.map((a) => ({
          paymentAdviceId: advice.id,
          docType: a.docType,
          fileName: a.fileName,
          blobPathname: a.blobPathname,
          blobUrl: a.blobUrl,
          sizeBytes: a.sizeBytes,
        })),
      );

      if (values.paymentMode === "CASH") {
        await tx.insert(cashVoucherItems).values(
          values.cashVoucherItems.map((item, sortOrder) => ({
            paymentAdviceId: advice.id,
            description: item.description,
            amount: item.amount.toFixed(2),
            sortOrder,
          })),
        );
      }

      await tx.insert(auditLog).values({
        paymentAdviceId: advice.id,
        action: "SUBMITTED",
        actor: values.submittedByName,
        ipAddress: clientIp(req),
        details: { serialNo },
      });

      return advice.id;
    });

    const [authority] = await db
      .select({ authorityName: recommendingAuthorities.authorityName, email: recommendingAuthorities.email })
      .from(recommendingAuthorities)
      .where(eq(recommendingAuthorities.id, values.recommendingAuthorityId))
      .limit(1);
    const origin = new URL(req.url).origin;
    const authorityName = authority?.authorityName ?? "MCCIA Finance & Accounts";
    const displayNo = displayNoFor(values.paymentMode, serialNo, cashVoucherNo);
    const documentLabel = documentLabelFor(values.paymentMode);
    await notifySubmissionConfirmation(
      {
        displayNo,
        documentLabel,
        authorityName,
        submittedByName: values.submittedByName,
        payeeName: values.payeeName,
        amount: values.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 }),
        paymentMode: values.paymentMode,
        formDate: values.formDate,
        paymentAdvicePdfLink:
          values.paymentMode === "CASH" ? undefined : `${origin}/api/advice/${adviceId}/pdf`,
        cashVoucherPdfLink:
          values.paymentMode === "CASH"
            ? `${origin}/api/advice/${adviceId}/cash-voucher-pdf`
            : undefined,
      },
      values.submittedByEmail,
      adviceId,
    );
    await notifyAuthorityApproval(
      {
        displayNo,
        documentLabel,
        authorityName,
        submittedByName: values.submittedByName,
        payeeName: values.payeeName,
        amount: values.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 }),
        natureOfExpenditure:
          values.paymentMode === "CASH"
            ? values.cashVoucherItems.map((item) => item.description).join("; ")
            : values.natureOfExpenditure ?? "",
        billReference: values.billNo,
        paymentMode: values.paymentMode,
        formDate: values.formDate,
        approvalLink: `${origin}/authority-approval/${authorityToken}`,
      },
      authority?.email ?? null,
      adviceId,
    );

    return NextResponse.json({ serialNo, cashVoucherNo, id: adviceId, authorityToken, authorityName });
  } catch (err) {
    console.error("Submit failed after blob upload, cleaning up", err);
    await Promise.allSettled(uploadedPathnames.map((p) => del(p)));
    return NextResponse.json(
      { error: "Something went wrong while saving your submission. Please try again." },
      { status: 500 },
    );
  }
}
