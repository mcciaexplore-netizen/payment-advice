import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  paymentAdvices,
  attachments,
  recommendingAuthorities,
  cashVoucherItems,
  advanceParticulars,
} from "@/lib/db/schema";
import { PaymentAdviceForm } from "@/components/form/PaymentAdviceForm";
import { DocType, PaymentMode } from "@/lib/validation/payment-advice";
import { displayNoFor, documentLabelFor } from "@/lib/advice/document-identity";

export const dynamic = "force-dynamic";

export default async function EditPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const [advice] = await db
    .select()
    .from(paymentAdvices)
    .where(eq(paymentAdvices.editToken, token))
    .limit(1);

  const isValid =
    !!advice &&
    advice.status === "SENT_BACK" &&
    !!advice.editTokenExpiresAt &&
    advice.editTokenExpiresAt > new Date();

  if (!isValid || !advice) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <h1 className="font-heading text-2xl text-[#0b1f3a]">This link is no longer valid</h1>
        <p className="text-sm text-gray-600">
          This edit link has expired, has already been used, or does not exist. Please contact
          the Accounts department for help with this Payment Advice.
        </p>
      </main>
    );
  }

  const [authorities, adviceAttachments, voucherItems, particulars] = await Promise.all([
    db
      .select({
        id: recommendingAuthorities.id,
        authorityName: recommendingAuthorities.authorityName,
      })
      .from(recommendingAuthorities)
      .where(eq(recommendingAuthorities.isActive, true)),
    db.select().from(attachments).where(eq(attachments.paymentAdviceId, advice.id)),
    db
      .select()
      .from(cashVoucherItems)
      .where(eq(cashVoucherItems.paymentAdviceId, advice.id))
      .orderBy(cashVoucherItems.sortOrder),
    db
      .select()
      .from(advanceParticulars)
      .where(eq(advanceParticulars.paymentAdviceId, advice.id))
      .orderBy(asc(advanceParticulars.sortOrder)),
  ]);

  const existingAttachments: Partial<Record<DocType, string[]>> = {};
  for (const a of adviceAttachments) {
    const docType = a.docType as DocType;
    existingAttachments[docType] = [...(existingAttachments[docType] ?? []), a.fileName];
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-10">
      <header className="border-b border-gray-200 pb-6">
        <p className="text-xs font-medium tracking-wide text-gray-500">
          {displayNoFor(
            advice.paymentMode as PaymentMode,
            advice.serialNo,
            advice.cashVoucherNo,
            advice.isAdvance,
            advice.advanceNo,
          )}
          {advice.paymentMode === "CASH" || advice.isAdvance ? ` (Internal Ref. ${advice.serialNo})` : ""}
        </p>
        <h1 className="font-heading text-3xl text-[#0b1f3a]">
          Correct and Resubmit {documentLabelFor(advice.paymentMode as PaymentMode, advice.isAdvance)}
        </h1>
      </header>

      <div className="rounded-md border border-[#e8a33d]/40 bg-[#e8a33d]/10 p-4 text-sm text-[#8a5a12]">
        <p className="font-medium">Remarks from Finance &amp; Accounts</p>
        <p className="mt-1">{advice.adminRemarks}</p>
      </div>

      <PaymentAdviceForm
        mode={advice.isAdvance ? "advance" : advice.paymentMode === "CASH" ? "cash-voucher" : "payment-advice"}
        recommendingAuthorities={authorities}
        editToken={token}
        existingAttachments={existingAttachments}
        prefill={{
          submittedByName: advice.submittedByName,
          submittedByEmail: advice.submittedByEmail,
          submittedByDepartment: advice.submittedByDepartment,
          recommendingAuthorityId: advice.recommendingAuthorityId,
          vendorId: advice.vendorId ?? undefined,
          payeeName: advice.payeeName,
          payeeAddress: advice.payeeAddress,
          payeeContactPerson: advice.payeeContactPerson ?? undefined,
          payeeContactPhone: advice.payeeContactPhone ?? undefined,
          payeeEmail: advice.payeeEmail ?? undefined,
          payeeGstin: advice.payeeGstin ?? undefined,
          payeeUdyamNumber: advice.payeeUdyamNumber ?? undefined,
          billNo: advice.billNo,
          billDate: advice.billDate,
          poNumber: advice.poNumber ?? undefined,
          poDate: advice.poDate ?? undefined,
          deliveryChallanNo: advice.deliveryChallanNo ?? undefined,
          deliveryChallanDate: advice.deliveryChallanDate ?? undefined,
          amount: Number(advice.amount),
          // Old NEFT rows submitted before the Basic/GST split only have
          // `amount` — leave these blank rather than guessing a split, so
          // the submitter supplies real Basic/GST values on resubmit.
          basicAmount: advice.basicAmount !== null ? Number(advice.basicAmount) : undefined,
          gstAmount: advice.gstAmount !== null ? Number(advice.gstAmount) : undefined,
          natureOfExpenditure: advice.natureOfExpenditure,
          cashVoucherItems: voucherItems.map((item) => ({
            description: item.description,
            amount: Number(item.amount),
          })),
          isAdvance: advice.isAdvance,
          purposeOfAdvance: advice.purposeOfAdvance ?? undefined,
          previousPendingAdvanceAmount:
            advice.previousPendingAdvanceAmount !== null
              ? Number(advice.previousPendingAdvanceAmount)
              : undefined,
          previousPendingAdvanceSince: advice.previousPendingAdvanceSince ?? undefined,
          advanceParticulars: particulars.map((item) => ({
            description: item.description,
            amount: Number(item.amount),
          })),
          paymentMode: advice.paymentMode as PaymentMode,
          bankAccountNo: advice.bankAccountNo ?? undefined,
          bankIfsc: advice.bankIfsc ?? undefined,
          beneficiaryName: advice.beneficiaryName ?? undefined,
          bankName: advice.bankName ?? undefined,
          enclosures: advice.enclosures ?? undefined,
          specialRemarks: advice.specialRemarks ?? undefined,
          formDate: advice.formDate,
        }}
      />
    </main>
  );
}
