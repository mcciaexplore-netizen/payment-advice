export type PipelineStageAdvice = {
  status: string;
  approvedAt: Date | null;
  financeReceivedAt: Date | null;
  verifiedAt: Date | null;
  paymentDoneAt: Date | null;
  paymentMode: string;
  totalPaid: string;
};

export function pipelineStageFor(advice: PipelineStageAdvice): string {
  if (advice.status === "SENT_BACK") return "Sent Back";
  if (advice.status === "APPROVED") {
    return advice.paymentMode === "CASH" ? "Payment Done" : "Fully Payment Settled";
  }
  if (!advice.approvedAt) return "Waiting on Authority";
  if (!advice.financeReceivedAt) return "Awaiting Finance Review";
  if (!advice.verifiedAt) return "Received & In Process";
  if (advice.paymentMode === "NEFT" && Number(advice.totalPaid) > 0) {
    return "Partial Payment Done";
  }
  if (advice.paymentDoneAt) return "Payment Done";
  return "Verified — Ready for Payment";
}
