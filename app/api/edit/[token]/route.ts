import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { del } from "@vercel/blob";
import { db } from "@/lib/db";
import {
  paymentAdvices,
  attachments,
  auditLog,
  cashVoucherItems,
  advanceParticulars,
  recommendingAuthorities,
} from "@/lib/db/schema";
import { notifyAuthorityApproval } from "@/lib/email/notify";
import { generateAuthorityToken } from "@/lib/advice/authority-token";
import { displayNoFor, documentLabelFor } from "@/lib/advice/document-identity";
import {
  allocateAdvanceNumber,
  allocateCashVoucherNumber,
  allocatePaymentAdviceNumber,
} from "@/lib/serial";
import { parsePaymentAdviceFormData } from "@/lib/form-data";
import {
  paymentAdviceFormSchema,
  DOC_TYPES,
  DocType,
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

  const attachmentResult = parseUploadedAttachments(formData.get("uploadedAttachments"));
  if ("error" in attachmentResult) {
    return NextResponse.json({ error: attachmentResult.error }, { status: 400 });
  }
  const newAttachments = attachmentResult.attachments;
  const byDocType = groupUploadedAttachments(newAttachments);

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

  const existingCounts = Object.fromEntries(
    DOC_TYPES.map((docType) => [docType, existingByDocType.get(docType)?.length ?? 0]),
  ) as Record<DocType, number>;
  const countError = validateAttachmentCounts(byDocType, values.isAdvance, existingCounts);
  if (countError) return NextResponse.json({ error: countError }, { status: 400 });
  const verificationError = await verifyUploadedAttachments(newAttachments, !values.isAdvance);
  if (verificationError) return NextResponse.json({ error: verificationError }, { status: 400 });

  const uploadedPathnames = newAttachments.map((attachment) => attachment.blobPathname);
  try {
    const newAttachmentRecords = newAttachments;

    const now = new Date();
    const oldBlobPathnamesToDelete: string[] = [];
    const { token: authorityToken, expiresAt: authorityTokenExpiresAt } = generateAuthorityToken();

    // Keep the canonical reference in the submission type's independent
    // series. A type change on resubmission allocates from the destination
    // series; staying in the same type retains the existing reference.
    let serialNo: string;
    let cashVoucherNo: string | null = null;
    let advanceNo: string | null = null;
    if (values.isAdvance) {
      advanceNo = advice.isAdvance
        ? advice.advanceNo ?? advice.serialNo
        : await db.transaction((tx) => allocateAdvanceNumber(tx, advice.financialYear));
      serialNo = advanceNo;
    } else if (values.paymentMode === "CASH") {
      cashVoucherNo = !advice.isAdvance && advice.paymentMode === "CASH"
        ? advice.cashVoucherNo ?? advice.serialNo
        : await db.transaction((tx) => allocateCashVoucherNumber(tx, advice.financialYear));
      serialNo = cashVoucherNo;
    } else if (!advice.isAdvance && advice.paymentMode === "NEFT") {
      serialNo = advice.serialNo;
    } else {
      serialNo = await db.transaction((tx) =>
        allocatePaymentAdviceNumber(tx, advice.financialYear),
      );
    }

    // Bill & Reference doesn't exist for an Advance Payment — see
    // app/api/submit/route.ts for the same dual-representation reasoning.
    const billNo = values.isAdvance
      ? (values.billNo ?? advanceNo ?? serialNo)
      : values.paymentMode === "CASH"
        ? (values.billNo ?? "")
        : values.billNo!;
    const billDate = values.isAdvance || values.paymentMode === "CASH" ? (values.billDate ?? values.formDate) : values.billDate!;

    await db.transaction(async (tx) => {
      await tx
        .update(paymentAdvices)
        .set({
          formDate: values.formDate,
          serialNo,
          // A resubmission is a materially new submission — the Authority's
          // prior approve/reject decision no longer applies, and a fresh
          // token is issued so an already-actioned link can't be reused to
          // silently reopen the old decision on the new content.
          authorityApprovedAt: null,
          authorityRejectedAt: null,
          authorityRemarks: null,
          authorityToken,
          authorityTokenExpiresAt,
          // Same reasoning as the authority fields above: a resubmission is
          // materially new content, so any Finance review already done on
          // the previous version no longer applies.
          financeReceivedAt: null,
          verifiedAt: null,
          verifiedBy: null,
          sanctionedAt: null,
          sanctionedBy: null,
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
          natureOfExpenditure: values.isAdvance
            ? values.purposeOfAdvance ?? ""
            : values.paymentMode === "CASH"
              ? values.cashVoucherItems.map((item) => item.description).join("; ")
              : values.natureOfExpenditure ?? "",
          enclosures: values.enclosures ?? null,
          specialRemarks: values.specialRemarks ?? null,
          paymentMode: values.paymentMode,
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
          bankAccountNo: values.bankAccountNo ?? null,
          bankIfsc: values.bankIfsc ?? null,
          beneficiaryName: values.beneficiaryName ?? null,
          bankName: values.bankName ?? null,
          submittedByName: values.submittedByName,
          submittedByEmail: values.submittedByEmail,
          submittedByDepartment: values.submittedByDepartment,
          recommendingAuthorityId: values.recommendingAuthorityId,
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

      await tx
        .delete(cashVoucherItems)
        .where(eq(cashVoucherItems.paymentAdviceId, advice.id));
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

      await tx
        .delete(advanceParticulars)
        .where(eq(advanceParticulars.paymentAdviceId, advice.id));
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
        details: { serialNo, revisionCount: advice.revisionCount + 1 },
      });
    });

    await Promise.allSettled(oldBlobPathnamesToDelete.map((p) => del(p)));

    const [authority] = await db
      .select({ authorityName: recommendingAuthorities.authorityName, email: recommendingAuthorities.email })
      .from(recommendingAuthorities)
      .where(eq(recommendingAuthorities.id, values.recommendingAuthorityId))
      .limit(1);
    const origin = new URL(req.url).origin;
    const authorityName = authority?.authorityName ?? "MCCIA Finance & Accounts";
    await notifyAuthorityApproval(
      {
        displayNo: displayNoFor(
          values.paymentMode,
          serialNo,
          cashVoucherNo,
          values.isAdvance,
          advanceNo,
        ),
        documentLabel: documentLabelFor(values.paymentMode, values.isAdvance),
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
        revisionCount: advice.revisionCount + 1,
        previousRemarks: advice.adminRemarks,
      },
      authority?.email ?? null,
      advice.id,
    );

    return NextResponse.json({
      serialNo,
      cashVoucherNo,
      advanceNo,
      id: advice.id,
      authorityToken,
      authorityName,
    });
  } catch (err) {
    console.error("Resubmit failed after blob upload, cleaning up", err);
    await Promise.allSettled(uploadedPathnames.map((p) => del(p)));
    return NextResponse.json(
      { error: "Something went wrong while saving your resubmission. Please try again." },
      { status: 500 },
    );
  }
}
