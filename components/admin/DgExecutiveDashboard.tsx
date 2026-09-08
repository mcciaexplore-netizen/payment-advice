import Link from "next/link";
import { PipelineSummary, type PipelineSummaryMetric, type PipelineSummaryStage } from "./PipelineSummary";
import { formatDuration, type DgIntervalMetric } from "@/lib/advice/dg-dashboard";

const DG_STAGES: PipelineSummaryStage[] = [
  { tab: "waiting_authority", label: "Waiting on Authority" },
  { tab: "awaiting_finance", label: "Awaiting Finance Review" },
  { tab: "finance_processing", label: "In Finance Processing", styleStage: "Received & In Process" },
  { tab: "sent_back", label: "Sent Back" },
];

export function DgExecutiveDashboard({ metrics, intervals }: { metrics: PipelineSummaryMetric[]; intervals: DgIntervalMetric[] }) {
  return <div className="flex flex-col gap-8">
    <header>
      <h1 className="font-heading text-3xl text-[#0b1f3a]">DG Executive Dashboard</h1>
      <p className="mt-1 text-sm text-gray-600">Organization-wide payment pipeline overview</p>
    </header>
    <nav className="flex flex-wrap items-center gap-2 border-b border-gray-200">
      <Link href="/authority?role=AUTHORITY&view=executive" className="border-b-2 border-[#0b1f3a] px-4 py-2 text-sm font-medium text-[#0b1f3a]">Executive Dashboard</Link>
      <Link href="/authority?role=AUTHORITY&view=pending" className="px-4 py-2 text-sm font-medium text-gray-500">Pending My Recommendation</Link>
      <Link href="/authority?role=AUTHORITY&view=history" className="px-4 py-2 text-sm font-medium text-gray-500">History</Link>
      <Link href="/authority?role=AUTHORITY&view=my-submissions" className="px-4 py-2 text-sm font-medium text-gray-500">My Submissions</Link>
    </nav>
    <PipelineSummary metrics={metrics} stages={DG_STAGES} />
    <section>
      <h2 className="mb-3 font-heading text-xl text-[#0b1f3a]">Processing Efficiency</h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {intervals.map((interval) => <article key={interval.key} className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{interval.label}</p>
          <p className="mt-1 text-xs text-gray-500">{interval.description}</p>
          <p className="mt-4 font-heading text-3xl text-[#0b1f3a]">{formatDuration(interval.averageHours)}</p>
          <p className="mt-1 text-xs text-gray-500">Average across {interval.completedCount} completed interval{interval.completedCount === 1 ? "" : "s"}</p>
          <div className="mt-4 border-t border-gray-100 pt-3 text-sm">
            <p><span className="font-semibold text-[#0b1f3a]">{interval.stuckCount}</span> currently waiting</p>
            {interval.longestPending ? <p className="mt-1 text-xs text-amber-700">Longest: {interval.longestPending.reference} · {formatDuration(interval.longestPending.hours)}</p> : <p className="mt-1 text-xs text-gray-500">No submission currently waiting.</p>}
          </div>
        </article>)}
      </div>
    </section>
    <p className="text-xs text-gray-500">Averages include only submissions that completed each interval. Pending submissions are shown separately and never counted as zero.</p>
  </div>;
}
