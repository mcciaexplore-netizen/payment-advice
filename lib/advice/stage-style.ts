import type { AdminTab } from "@/lib/admin/filters";
import type { PipelineStage } from "@/lib/advice/pipeline-stage";

export type StageStyle = {
  /** Short badge text — never the full tab-length label (see AGENT_HANDOFF.md
   * for the exact wording call for each stage, including the two
   * deliberate departures from the task's own suggested wording). */
  shortLabel: string;
  /** Per-row badge / chip: tinted background, dark text, subtle border. */
  badge: string;
  /** Active tab: solid background, white text. */
  tabActive: string;
  /** Inactive tab: tinted background, colored text/border — same family as
   * the badge, so a tab and the badges under it always read as one color. */
  tabInactive: string;
  /** Small solid dot — legend entries and the Dashboard's stage cards. */
  dot: string;
};

/**
 * One color per pipeline stage, grouped by shared meaning rather than
 * forced into 9 unique hues (see AGENT_HANDOFF.md for the full rationale
 * per stage, including why "Fully Payment Settled" and "Payment Done"
 * share forest green and why Advance Payment gets its own distinct violet
 * rather than reusing Awaiting Finance Review's amber). Every color pairs
 * a light tint (badges, inactive tabs) with a solid version (active tabs,
 * legend dots) from the same hue, so switching between the two states
 * never reads as a different color family.
 */
export const STAGE_STYLE: Record<PipelineStage, StageStyle> = {
  "Waiting on Authority": {
    shortLabel: "Submitted",
    badge: "bg-slate-100 text-slate-700 border-slate-300",
    tabActive: "bg-slate-600 text-white border-slate-600",
    tabInactive: "bg-slate-50 text-slate-600 border-slate-300 hover:border-slate-500",
    dot: "bg-slate-500",
  },
  "Awaiting Finance Review": {
    // "Recommended" rather than the task's suggested "Approved" — this
    // app's own terminology already moved from Approve/Approved to
    // Recommend/Recommended for the Authority's action (see the
    // 2026-09-04 wording-alignment commits); reusing "Approved" here would
    // reintroduce the exact inconsistency that work just removed.
    shortLabel: "Recommended",
    badge: "bg-[#e8a33d]/15 text-[#8a5a12] border-[#e8a33d]/40",
    tabActive: "bg-[#e8a33d] text-white border-[#e8a33d]",
    tabInactive: "bg-[#e8a33d]/10 text-[#8a5a12] border-[#e8a33d]/40 hover:border-[#e8a33d]",
    dot: "bg-[#e8a33d]",
  },
  "Advance Payment": {
    shortLabel: "Advance",
    badge: "bg-violet-100 text-violet-700 border-violet-300",
    tabActive: "bg-violet-600 text-white border-violet-600",
    tabInactive: "bg-violet-50 text-violet-600 border-violet-300 hover:border-violet-500",
    dot: "bg-violet-600",
  },
  "Received & In Process": {
    shortLabel: "In Process",
    badge: "bg-blue-100 text-blue-700 border-blue-300",
    tabActive: "bg-blue-600 text-white border-blue-600",
    tabInactive: "bg-blue-50 text-blue-600 border-blue-300 hover:border-blue-500",
    dot: "bg-blue-600",
  },
  "Verified — Ready for Payment": {
    shortLabel: "Verified",
    badge: "bg-teal-100 text-teal-700 border-teal-300",
    tabActive: "bg-teal-600 text-white border-teal-600",
    tabInactive: "bg-teal-50 text-teal-600 border-teal-300 hover:border-teal-500",
    dot: "bg-teal-600",
  },
  "Partial Payment Done": {
    shortLabel: "Partial Paid",
    badge: "bg-orange-100 text-orange-700 border-orange-300",
    tabActive: "bg-orange-600 text-white border-orange-600",
    tabInactive: "bg-orange-50 text-orange-600 border-orange-300 hover:border-orange-500",
    dot: "bg-orange-600",
  },
  "Fully Payment Settled": {
    shortLabel: "Paid",
    badge: "bg-[#2e8b57]/15 text-[#1e5c39] border-[#2e8b57]/40",
    tabActive: "bg-[#2e8b57] text-white border-[#2e8b57]",
    tabInactive: "bg-[#2e8b57]/10 text-[#1e5c39] border-[#2e8b57]/40 hover:border-[#2e8b57]",
    dot: "bg-[#2e8b57]",
  },
  "Payment Done": {
    // Same forest green as Fully Payment Settled — deliberately identical
    // styles object, not just a similar-looking duplicate, so the two can
    // never quietly drift apart.
    shortLabel: "Paid",
    badge: "bg-[#2e8b57]/15 text-[#1e5c39] border-[#2e8b57]/40",
    tabActive: "bg-[#2e8b57] text-white border-[#2e8b57]",
    tabInactive: "bg-[#2e8b57]/10 text-[#1e5c39] border-[#2e8b57]/40 hover:border-[#2e8b57]",
    dot: "bg-[#2e8b57]",
  },
  "Sent Back": {
    shortLabel: "Sent Back",
    badge: "bg-red-100 text-red-700 border-red-300",
    tabActive: "bg-red-600 text-white border-red-600",
    tabInactive: "bg-red-50 text-red-600 border-red-300 hover:border-red-500",
    dot: "bg-red-600",
  },
};

/** Every stage in the fixed display order used by the tab bar, the
 * Dashboard's Pipeline Summary cards, and the legend — one shared order so
 * all three always list stages the same way. */
export const PIPELINE_STAGE_ORDER: PipelineStage[] = [
  "Waiting on Authority",
  "Awaiting Finance Review",
  "Advance Payment",
  "Received & In Process",
  "Verified — Ready for Payment",
  "Partial Payment Done",
  "Fully Payment Settled",
  "Payment Done",
  "Sent Back",
];

/** Maps each real pipeline tab (every AdminTab except "all", which has no
 * single stage/color of its own) to the stage it represents — lets the tab
 * bar reuse STAGE_STYLE without duplicating the stage-derivation logic
 * that lives solely in pipelineStageFor(). */
export const STAGE_FOR_TAB: Record<Exclude<AdminTab, "all">, PipelineStage> = {
  waiting_authority: "Waiting on Authority",
  awaiting_finance: "Awaiting Finance Review",
  advance_payment: "Advance Payment",
  received_in_process: "Received & In Process",
  verified_ready_payment: "Verified — Ready for Payment",
  partial_payment_done: "Partial Payment Done",
  fully_payment_settled: "Fully Payment Settled",
  payment_done: "Payment Done",
  sent_back: "Sent Back",
};
