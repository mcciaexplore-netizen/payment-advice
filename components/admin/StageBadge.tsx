import clsx from "clsx";
import type { PipelineStage } from "@/lib/advice/pipeline-stage";
import { STAGE_STYLE } from "@/lib/advice/stage-style";

/** Replaces the old StatusChip, which showed the raw `status` column
 * (SUBMITTED/SENT_BACK/APPROVED) — SUBMITTED covers almost the entire
 * pipeline, so every row read "Submitted" regardless of actual stage. This
 * takes an already-derived PipelineStage instead (see
 * lib/advice/pipeline-stage.ts) and shows both a short label and its
 * stage's color — color is reinforcement, the text is what actually
 * carries the meaning. Shared by the Finance Admin and Authority
 * dashboards so a given stage always looks identical in both. */
export function StageBadge({ stage, className }: { stage: PipelineStage; className?: string }) {
  const style = STAGE_STYLE[stage];
  return (
    <span
      title={stage}
      className={clsx(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        style.badge,
        className,
      )}
    >
      {style.shortLabel}
    </span>
  );
}
