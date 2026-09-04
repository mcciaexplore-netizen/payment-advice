export type PipelineStageAdvice = {
  status: string;
  approvedAt: Date | null;
  financeReceivedAt: Date | null;
  verifiedAt: Date | null;
  paymentDoneAt: Date | null;
  paymentMode: string;
  totalPaid: string;
  isAdvance: boolean;
};

/** Every stage this function can return — the single source of truth for
 * "which stage is this row actually in," shared by the admin tab
 * counts/filters (lib/admin/filters.ts's buildTabCondition, the SQL
 * equivalent of this same derivation) and every per-row stage badge/label
 * across both the Finance Admin and Authority dashboards (lib/advice/
 * stage-style.ts). Don't add a second implementation of this logic
 * anywhere — extend this one function instead. */
export type PipelineStage =
  | "Waiting on Authority"
  | "Awaiting Finance Review"
  | "Advance Payment"
  | "Received & In Process"
  | "Verified — Ready for Payment"
  | "Partial Payment Done"
  | "Fully Payment Settled"
  | "Payment Done"
  | "Sent Back";

export function pipelineStageFor(advice: PipelineStageAdvice): PipelineStage {
  if (advice.status === "SENT_BACK") return "Sent Back";
  if (advice.status === "APPROVED") {
    return advice.paymentMode === "CASH" ? "Payment Done" : "Fully Payment Settled";
  }
  if (!advice.approvedAt) return "Waiting on Authority";
  // Mirrors buildTabCondition's advance_payment/awaiting_finance split — an
  // authority-approved advance lands here instead of "Awaiting Finance
  // Review" until Finance marks it Received, at which point isAdvance no
  // longer affects the derived stage (same "landing point only" rule
  // documented in AGENT_HANDOFF.md for the tab itself).
  if (!advice.financeReceivedAt) return advice.isAdvance ? "Advance Payment" : "Awaiting Finance Review";
  if (!advice.verifiedAt) return "Received & In Process";
  if (advice.paymentMode === "NEFT" && Number(advice.totalPaid) > 0) {
    return "Partial Payment Done";
  }
  if (advice.paymentDoneAt) return "Payment Done";
  return "Verified — Ready for Payment";
}
