import Link from "next/link";
import type { AdminTab } from "@/lib/admin/filters";
import { STAGE_FOR_TAB, STAGE_STYLE } from "@/lib/advice/stage-style";

export const PIPELINE_SUMMARY_STAGES: { tab: Exclude<AdminTab, "all">; label: string }[] = [
  { tab: "waiting_authority", label: "Waiting on Authority" },
  { tab: "awaiting_finance", label: "Awaiting Finance Review" },
  { tab: "advance_payment", label: "Advance Payment" },
  { tab: "received_in_process", label: "Received & In Process" },
  { tab: "verified_ready_payment", label: "Verified — Ready for Payment" },
  { tab: "partial_payment_done", label: "Partial Payment Done" },
  { tab: "fully_payment_settled", label: "Fully Payment Settled" },
  { tab: "payment_done", label: "Payment Done (Cash)" },
  { tab: "sent_back", label: "Sent Back" },
];

export type PipelineSummaryMetric = {
  tab: Exclude<AdminTab, "all">;
  count: number;
  sum: number;
};

function money(value: number) {
  return `₹ ${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function PipelineSummary({
  metrics,
  hrefFor,
}: {
  metrics: PipelineSummaryMetric[];
  hrefFor: (tab: Exclude<AdminTab, "all">) => string;
}) {
  return (
    <section>
      <h2 className="mb-3 font-heading text-xl text-[#0b1f3a]">Pipeline Summary</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {PIPELINE_SUMMARY_STAGES.map(({ tab, label }) => {
          const metric = metrics.find((row) => row.tab === tab) ?? { count: 0, sum: 0 };
          const stageStyle = STAGE_STYLE[STAGE_FOR_TAB[tab]];
          return (
            <Link key={tab} href={hrefFor(tab)} className="flex min-h-32 flex-col justify-between rounded-lg border border-gray-200 bg-white p-4 hover:border-[#0b1f3a] hover:shadow-sm">
              <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
                <span className={`h-1.5 w-1.5 flex-none rounded-full ${stageStyle.dot}`} />
                {label}
              </span>
              <span className="font-heading text-3xl text-[#0b1f3a]">{metric.count}</span>
              <span className="text-xs text-gray-500">{money(metric.sum)}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
