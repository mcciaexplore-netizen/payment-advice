import { NextRequest, NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  paymentAdvices,
  attachments,
  auditLog,
  cashVoucherItems,
  advanceParticulars,
  recommendingAuthorities,
} from "@/lib/db/schema";
import { notifyAuthorityApproval, notifySubmissionConfirmation } from "@/lib/email/notify";
import { generateAuthorityToken } from "@/lib/advice/authority-token";
import { displayNoFor, documentLabelFor } from "@/lib/advice/document-identity";
import {
  allocateAdvanceNumber,
  allocateCashVoucherNumber,
  allocateSerialNumber,
  financialYearFor,
} from "@/lib/serial";
import { parsePaymentAdviceFormData } from "@/lib/form-data";
import {
  paymentAdviceFormSchema,
} from "@/lib/validation/payment-advice";
import {
  groupUploadedAttachments,
  parseUploadedAttachments,
  validateAttachmentCounts,
} from "@/lib/attachments/client-upload";
import { verifyUploadedAttachments } from "@/lib/attachments/verify-uploaded";

export const runtime = "nodejs";

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
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

  const attachmentResult = parseUploadedAttachments(formData.get("uploadedAttachments"));
  if ("error" in attachmentResult) {
    return NextResponse.json({ error: attachmentResult.error }, { status: 400 });
  }
  const attachmentInputs = attachmentResult.attachments;
  const byDocType = groupUploadedAttachments(attachmentInputs);
  const countError = validateAttachmentCounts(byDocType, values.isAdvance, undefined, values.paymentMode);
  if (countError) return NextResponse.json({ error: countError }, { status: 400 });
  const verificationError = await verifyUploadedAttachments(attachmentInputs, !values.isAdvance);
  if (verificationError) return NextResponse.json({ error: verificationError }, { status: 400 });

  const now = new Date();
  let serialNo = "";
  let financialYear = "";
  let cashVoucherNo: string | null = null;
  let advanceNo: string | null = null;
  let billNo = values.billNo ?? "";

  const uploadedPathnames = attachmentInputs.map((attachment) => attachment.blobPathname);
  try {
    const attachmentRecords = attachmentInputs;

    const { token: authorityToken, expiresAt: authorityTokenExpiresAt } = generateAuthorityToken();

    const adviceId = await db.transaction(async (tx) => {
      financialYear = financialYearFor(now);
      if (values.isAdvance) {
        advanceNo = await allocateAdvanceNumber(tx, financialYear);
        serialNo = advanceNo;
      } else if (values.paymentMode === "CASH") {
        cashVoucherNo = await allocateCashVoucherNumber(tx, financialYear);
        serialNo = cashVoucherNo;
      } else {
        ({ serialNo } = await allocateSerialNumber(tx, now));
      }

      // Allocation and row creation deliberately share this transaction. If
      // any insert below fails, the counter rolls back with the submission.
      billNo = values.isAdvance
        ? (values.billNo ?? advanceNo ?? serialNo)
        : values.paymentMode === "CASH"
          ? (values.billNo ?? "")
          : values.billNo!;
      const billDate = values.isAdvance || values.paymentMode === "CASH" ? (values.billDate ?? values.formDate) : values.billDate!;

      const [advice] = await tx
        .insert(paymentAdvices)
        .values({
          serialNo,
          financialYear,
          cashVoucherNo,
          isAdvance: values.isAdvance,
          advanceNo,
          purposeOfAdvance: values.isAdvance ? values.purposeOfAdvance ?? null : null,
          previousPendingAdvanceAmount: values.isAdvance
            ? values.previousPendingAdvanceAmount.toFixed(2)
            : null,
          previousPendingAdvanceSince: values.isAdvance
            ? values.previousPendingAdvanceSince ?? null
            : null,
          status: "SUBMITTED",
          authorityToken,
          authorityTokenExpiresAt,
          formDate: values.formDate,
          vendorId: values.vendorId ?? null,
          payeeName: values.payeeName,
          payeeAddress: values.payeeAddress ?? "",
          payeeEmail: values.payeeEmail ?? null,
          payeeContactPerson: values.payeeContactPerson ?? null,
          payeeContactPhone: values.payeeContactPhone ?? null,
          payeeGstin: values.payeeGstin ?? null,
          payeeUdyamNumber: values.payeeUdyamNumber ?? null,
          poNumber: values.poNumber ?? null,
          poDate: values.poDate ?? null,
          deliveryChallanNo: values.deliveryChallanNo ?? null,
          deliveryChallanDate: values.deliveryChallanDate ?? null,
          billNo,
          billDate,
          amount: values.amount.toFixed(2),
          basicAmount:
            values.paymentMode === "NEFT" && !values.isAdvance
              ? values.basicAmount!.toFixed(2)
              : null,
          gstAmount:
            values.paymentMode === "NEFT" && !values.isAdvance
              ? values.gstAmount!.toFixed(2)
              : null,
          // Mirrored into this NOT NULL column so every existing reader
          // (PDF, Excel, authority-approval email) keeps working unchanged
          // — same dual-representation pattern cash_voucher_items uses.
          natureOfExpenditure: values.isAdvance
            ? values.purposeOfAdvance ?? ""
            : values.paymentMode === "CASH"
              ? values.cashVoucherItems.map((item) => item.description).join("; ")
              : values.natureOfExpenditure ?? "",
          enclosures: values.enclosures ?? null,
          specialRemarks: values.specialRemarks ?? null,
          paymentMode: values.paymentMode,
          bankAccountNo: values.bankAccountNo ?? null,
          bankIfsc: values.bankIfsc ?? null,
          beneficiaryName: values.beneficiaryName ?? null,
          bankName: values.bankName ?? null,
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

      if (values.paymentMode === "CASH" && !values.isAdvance) {
        await tx.insert(cashVoucherItems).values(
          values.cashVoucherItems.map((item, sortOrder) => ({
            paymentAdviceId: advice.id,
            description: item.description,
            amount: item.amount.toFixed(2),
            sortOrder,
          })),
        );
      }

      if (values.isAdvance) {
        await tx.insert(advanceParticulars).values(
          values.advanceParticulars.map((item, sortOrder) => ({
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
    const displayNo = displayNoFor(values.paymentMode, serialNo, cashVoucherNo, values.isAdvance, advanceNo);
    const documentLabel = documentLabelFor(values.paymentMode, values.isAdvance);
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
        natureOfExpenditure: values.isAdvance
          ? values.purposeOfAdvance ?? ""
          : values.paymentMode === "CASH"
            ? values.cashVoucherItems.map((item) => item.description).join("; ")
            : values.natureOfExpenditure ?? "",
        billReference: billNo,
        paymentMode: values.paymentMode,
        formDate: values.formDate,
        approvalLink: `${origin}/authority-approval/${authorityToken}`,
      },
      authority?.email ?? null,
      adviceId,
    );

    return NextResponse.json({
      serialNo,
      cashVoucherNo,
      advanceNo,
      id: adviceId,
      authorityToken,
      authorityName,
    });
  } catch (err) {
    console.error("Submit failed after blob upload, cleaning up", err);
    await Promise.allSettled(uploadedPathnames.map((p) => del(p)));
    return NextResponse.json(
      { error: "Something went wrong while saving your submission. Please try again." },
      { status: 500 },
    );
  }
}
