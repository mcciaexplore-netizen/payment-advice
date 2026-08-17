import { renderToBuffer } from "@react-pdf/renderer";
import { cashVoucherItems, paymentAdvices } from "@/lib/db/schema";
import { PaymentAdviceDocument } from "@/lib/pdf/PaymentAdviceDocument";
import { CashVoucherDocument } from "@/lib/pdf/CashVoucherDocument";

type PaymentAdviceRow = typeof paymentAdvices.$inferSelect;
type CashVoucherItemRow = typeof cashVoucherItems.$inferSelect;

/** Shared by the admin (approval-gated) and public (pre-approval, for
 * physical signing) PDF routes so the advice-row -> PDF-data mapping only
 * lives in one place. */
export async function renderPaymentAdvicePdf(
  advice: PaymentAdviceRow,
  recommendingAuthorityName: string,
): Promise<Buffer> {
  return renderToBuffer(
    <PaymentAdviceDocument
      data={{
        serialNo: advice.serialNo,
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
        submittedByName: advice.submittedByName,
        recommendingAuthorityName,
        verifiedBy: advice.verifiedBy,
        verifiedAt: advice.verifiedAt ? advice.verifiedAt.toISOString() : null,
        sanctionedBy: advice.sanctionedBy,
        submittedAt: advice.submittedAt.toISOString(),
        authorityApprovedAt: advice.authorityApprovedAt ? advice.authorityApprovedAt.toISOString() : null,
        approvedAt: advice.approvedAt ? advice.approvedAt.toISOString() : null,
        approvedByName: advice.approvedByName,
      }}
    />,
  );
}

export function pdfFilename(serialNo: string): string {
  return `${serialNo.replace(/\//g, "-")}.pdf`;
}

export async function renderCashVoucherPdf(
  advice: PaymentAdviceRow,
  items: CashVoucherItemRow[],
  recommendingAuthorityName: string,
): Promise<Buffer> {
  return renderToBuffer(
    <CashVoucherDocument
      data={{
        cashVoucherNo: advice.cashVoucherNo ?? advice.serialNo,
        formDate: advice.formDate,
        payeeName: advice.payeeName,
        items: items.map((item) => ({ description: item.description, amount: item.amount })),
        submittedByName: advice.submittedByName,
        submittedAt: advice.submittedAt.toISOString(),
        recommendingAuthorityName,
        authorityApprovedAt: advice.authorityApprovedAt ? advice.authorityApprovedAt.toISOString() : null,
        sanctionedBy: advice.sanctionedBy,
      }}
    />,
  );
}

export function cashVoucherPdfFilename(cashVoucherNo: string): string {
  return `Cash-Voucher-${cashVoucherNo.replace(/\//g, "-")}.pdf`;
}
