import type { PipelineStage, PipelineStageAdvice } from "./pipeline-stage";
import { pipelineStageFor } from "./pipeline-stage";

const DAY_MS = 24 * 60 * 60 * 1000;
export const STAGE_STALE_AFTER_DAYS = 7;

export type StageAgingAdvice = PipelineStageAdvice & {
  submittedAt: Date;
  updatedAt: Date | null;
  revisionCount: number;
  sentBackAt: Date | null;
  firstPaymentAt: Date | null;
};

export function currentStageEnteredAt(advice: StageAgingAdvice): Date | null {
  const stage = pipelineStageFor(advice);
  if (stage === "Waiting on Authority") {
    return advice.revisionCount > 0 ? advice.updatedAt ?? advice.submittedAt : advice.submittedAt;
  }
  if (stage === "Awaiting Finance Review" || stage === "Advance Payment") return advice.approvedAt;
  if (stage === "Received & In Process") return advice.financeReceivedAt;
  if (stage === "Verified — Ready for Payment") return advice.verifiedAt;
  if (stage === "Partial Payment Done") return advice.firstPaymentAt;
  if (stage === "Sent Back") return advice.sentBackAt;
  return null;
}

export function stageAging(advice: StageAgingAdvice, now = new Date()): {
  stage: PipelineStage;
  enteredAt: Date;
  days: number;
  label: string;
  isStale: boolean;
} | null {
  const stage = pipelineStageFor(advice);
  const enteredAt = currentStageEnteredAt(advice);
  if (!enteredAt) return null;
  const days = Math.max(0, Math.floor((now.getTime() - enteredAt.getTime()) / DAY_MS));
  return {
    stage,
    enteredAt,
    days,
    label: `${days} ${days === 1 ? "day" : "days"} in ${stage}`,
    isStale: days > STAGE_STALE_AFTER_DAYS,
  };
}

/** Non-final work is ordered by its current-stage entry time (oldest first).
 * Final rows follow it, newest submission first. */
export function compareByCurrentStageAge(a: StageAgingAdvice, b: StageAgingAdvice): number {
  const aEntered = currentStageEnteredAt(a)?.getTime();
  const bEntered = currentStageEnteredAt(b)?.getTime();
  if (aEntered !== undefined && bEntered !== undefined) return aEntered - bEntered;
  if (aEntered !== undefined) return -1;
  if (bEntered !== undefined) return 1;
  return b.submittedAt.getTime() - a.submittedAt.getTime();
}
