import { renderToBuffer } from "@react-pdf/renderer";
import { paymentAdvices } from "@/lib/db/schema";
import { PaymentAdviceDocument } from "@/lib/pdf/PaymentAdviceDocument";

type PaymentAdviceRow = typeof paymentAdvices.$inferSelect;

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
        verifiedByName: advice.verifiedByName,
        sanctionedByName: advice.sanctionedByName,
        submittedAt: advice.submittedAt.toISOString(),
        approvedAt: advice.approvedAt ? advice.approvedAt.toISOString() : null,
        approvedByName: advice.approvedByName,
      }}
    />,
  );
}

export function pdfFilename(serialNo: string): string {
  return `${serialNo.replace(/\//g, "-")}.pdf`;
}
