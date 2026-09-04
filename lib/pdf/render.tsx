import { renderToBuffer } from "@react-pdf/renderer";
import { advanceParticulars, cashVoucherItems, paymentAdvices } from "@/lib/db/schema";
import { PaymentAdviceDocument } from "@/lib/pdf/PaymentAdviceDocument";
import { CashVoucherDocument } from "@/lib/pdf/CashVoucherDocument";
import { displayNoFor } from "@/lib/advice/document-identity";
import { type PaymentMode } from "@/lib/validation/payment-advice";

type PaymentAdviceRow = typeof paymentAdvices.$inferSelect;
type CashVoucherItemRow = typeof cashVoucherItems.$inferSelect;
type AdvanceParticularRow = typeof advanceParticulars.$inferSelect;

/** Shared by the admin (approval-gated) and public (pre-approval, for
 * physical signing) PDF routes so the advice-row -> PDF-data mapping only
 * lives in one place. */
export async function renderPaymentAdvicePdf(
  advice: PaymentAdviceRow,
  recommendingAuthorityName: string,
  particulars: AdvanceParticularRow[] = [],
): Promise<Buffer> {
  return renderToBuffer(
    <PaymentAdviceDocument
      data={{
        displayNo: displayNoFor(
          advice.paymentMode as PaymentMode,
          advice.serialNo,
          advice.cashVoucherNo,
          advice.isAdvance,
          advice.advanceNo,
        ),
        formDate: advice.formDate,
        payeeName: advice.payeeName,
        payeeAddress: advice.payeeAddress,
        payeeEmail: advice.payeeEmail,
        payeeContactPerson: advice.payeeContactPerson,
        payeeContactPhone: advice.payeeContactPhone,
        poNumber: advice.poNumber,
        poDate: advice.poDate,
        deliveryChallanNo: advice.deliveryChallanNo,
        deliveryChallanDate: advice.deliveryChallanDate,
        billNo: advice.billNo,
        billDate: advice.billDate,
        amount: advice.amount,
        basicAmount: advice.basicAmount,
        gstAmount: advice.gstAmount,
        billPassedFor: advice.billPassedFor,
        natureOfExpenditure: advice.natureOfExpenditure,
        enclosures: advice.enclosures,
        specialRemarks: advice.specialRemarks,
        paymentMode: advice.paymentMode as "NEFT" | "CASH",
        bankAccountNo: advice.bankAccountNo,
        bankIfsc: advice.bankIfsc,
        beneficiaryName: advice.beneficiaryName,
        bankName: advice.bankName,
        submittedByName: advice.submittedByName,
        recommendingAuthorityName,
        verifiedBy: advice.verifiedBy,
        verifiedAt: advice.verifiedAt ? advice.verifiedAt.toISOString() : null,
        sanctionedBy: advice.sanctionedBy,
        submittedAt: advice.submittedAt.toISOString(),
        authorityApprovedAt: advice.authorityApprovedAt ? advice.authorityApprovedAt.toISOString() : null,
        approvedAt: advice.approvedAt ? advice.approvedAt.toISOString() : null,
        approvedByName: advice.approvedByName,
        isAdvance: advice.isAdvance,
        previousPendingAdvanceAmount: advice.previousPendingAdvanceAmount,
        previousPendingAdvanceSince: advice.previousPendingAdvanceSince,
        particulars: particulars.map((p) => ({
          description: p.description,
          amount: p.amount,
        })),
      }}
    />,
  );
}

export function pdfFilename(displayNo: string): string {
  return `${displayNo.replace(/\//g, "-")}.pdf`;
}

export async function renderCashVoucherPdf(
  advice: PaymentAdviceRow,
  items: CashVoucherItemRow[],
  recommendingAuthorityName: string,
  particulars: AdvanceParticularRow[] = [],
): Promise<Buffer> {
  const displayNo = displayNoFor(
    advice.paymentMode as PaymentMode,
    advice.serialNo,
    advice.cashVoucherNo,
    advice.isAdvance,
    advice.advanceNo,
  );
  return renderToBuffer(
    <CashVoucherDocument
      data={{
        displayNo,
        formDate: advice.formDate,
        payeeName: advice.payeeName,
        items: advice.isAdvance
          ? particulars.map((p) => ({ description: p.description, amount: p.amount }))
          : items.map((item) => ({ description: item.description, amount: item.amount })),
        submittedByName: advice.submittedByName,
        submittedAt: advice.submittedAt.toISOString(),
        recommendingAuthorityName,
        authorityApprovedAt: advice.authorityApprovedAt ? advice.authorityApprovedAt.toISOString() : null,
        sanctionedBy: advice.sanctionedBy,
        isAdvance: advice.isAdvance,
        purposeOfAdvance: advice.purposeOfAdvance,
        previousPendingAdvanceAmount: advice.previousPendingAdvanceAmount,
        previousPendingAdvanceSince: advice.previousPendingAdvanceSince,
      }}
    />,
  );
}

export function cashVoucherPdfFilename(displayNo: string): string {
  return `Cash-Voucher-${displayNo.replace(/\//g, "-")}.pdf`;
}
