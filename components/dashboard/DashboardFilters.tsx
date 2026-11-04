import Link from "next/link";
import { PIPELINE_SUMMARY_STAGES } from "@/components/admin/PipelineSummary";
import { STAGE_FOR_TAB, STAGE_STYLE } from "@/lib/advice/stage-style";
import { DECISIONS, hasActiveFilters, type DashboardCounts, type DashboardFilters as Filters } from "@/lib/advice/dashboard-filters";

const neutralActive = "border-[#0b1f3a] bg-[#0b1f3a] text-white";
const neutralInactive = "border-gray-300 bg-white text-gray-600 hover:border-[#0b1f3a] hover:text-[#0b1f3a]";
const buttonClass = "rounded-md border px-3 py-1.5 text-sm font-medium";

/** The stage filter (and, on History, the Decision filter), search box and
 * submitted date range above an Authority / Team dashboard table. One
 * component for every dashboard tab so they cannot drift. Stage names,
 * order and colors are the Finance Submissions ones (PIPELINE_SUMMARY_STAGES,
 * STAGE_STYLE). Plain links and a GET form: the state lives in the URL, and
 * the tab links carry none of it, so switching tabs resets to All. Counts
 * come from the dashboard's own scoped query; this only renders them. */
export function DashboardFilters({ base, filters, counts, showDecision }: {
  /** The tab's own URL parameters, kept on every link (role and view). */
  base: Record<string, string>;
  filters: Filters;
  counts: DashboardCounts;
  showDecision: boolean;
}) {
  const href = (patch: Partial<Record<keyof Filters, string | undefined>>) => {
    const next: Record<string, string | undefined> = { ...base, stage: filters.stage, decision: filters.decision, q: filters.q, dateFrom: filters.dateFrom, dateTo: filters.dateTo, ...patch };
    const query = new URLSearchParams(Object.entries(next).filter((entry): entry is [string, string] => Boolean(entry[1])));
    return `/authority?${query.toString()}`;
  };
  // Only stages with rows, plus the selected one so it can always be undone.
  const stages = PIPELINE_SUMMARY_STAGES.filter(({ tab }) => counts.stages[tab] > 0 || filters.stage === tab);
  const decisions = DECISIONS.filter(({ value }) => counts.decisions[value] > 0 || filters.decision === value);

  return (
    <section aria-label="Filter submissions" className="flex flex-col gap-3">
      <div role="group" aria-label="Filter by stage" className="flex flex-wrap items-center gap-2">
        <Link href={href({ stage: undefined })} aria-current={!filters.stage ? "true" : undefined} className={`${buttonClass} ${!filters.stage ? neutralActive : neutralInactive}`}>All ({counts.all})</Link>
        {stages.map(({ tab, label }) => {
          const style = STAGE_STYLE[STAGE_FOR_TAB[tab]];
          const active = filters.stage === tab;
          return <Link key={tab} href={href({ stage: tab })} aria-current={active ? "true" : undefined} className={`${buttonClass} ${active ? style.tabActive : style.tabInactive}`}>{label} ({counts.stages[tab]})</Link>;
        })}
      </div>
      {showDecision ? (
        <div role="group" aria-label="Filter by decision" className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-gray-600">Decision:</span>
          <Link href={href({ decision: undefined })} aria-current={!filters.decision ? "true" : undefined} className={`${buttonClass} ${!filters.decision ? neutralActive : neutralInactive}`}>All</Link>
          {decisions.map(({ value, label }) => {
            const active = filters.decision === value;
            return <Link key={value} href={href({ decision: value })} aria-current={active ? "true" : undefined} className={`${buttonClass} ${active ? neutralActive : neutralInactive}`}>{label} ({counts.decisions[value]})</Link>;
          })}
        </div>
      ) : null}
      <form method="get" action="/authority" className="flex flex-wrap items-end gap-3 rounded-md border border-gray-200 p-3">
        {Object.entries(base).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
        {filters.stage ? <input type="hidden" name="stage" value={filters.stage} /> : null}
        {filters.decision ? <input type="hidden" name="decision" value={filters.decision} /> : null}
        <label className="flex min-w-0 flex-1 basis-56 flex-col gap-1 text-xs font-medium text-gray-600">
          Search
          <input type="search" name="q" defaultValue={filters.q ?? ""} maxLength={100} placeholder="Reference, payee or particulars" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          From
          <input type="date" name="dateFrom" defaultValue={filters.dateFrom ?? ""} className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          To
          <input type="date" name="dateTo" defaultValue={filters.dateTo ?? ""} className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900" />
        </label>
        <div className="flex gap-2">
          <button type="submit" className="rounded-md bg-[#0b1f3a] px-4 py-2 text-sm font-medium text-white hover:bg-[#0b1f3a]/90">Apply</button>
          {hasActiveFilters(filters) ? <Link href={clearFiltersHref(base)} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Clear</Link> : null}
        </div>
      </form>
    </section>
  );
}

/** The tab with no filters: "All", no search, no dates. */
export function clearFiltersHref(base: Record<string, string>) {
  return `/authority?${new URLSearchParams(base).toString()}`;
}

/** Shown instead of the table when filters leave nothing. */
export function FilteredEmptyState({ base, filters }: { base: Record<string, string>; filters: Filters }) {
  return (
    <div className="rounded-lg border border-gray-200 p-10 text-center text-sm text-gray-500">
      {filters.stage ? "No submissions in this stage" : "No submissions match these filters"}.{" "}
      <Link href={clearFiltersHref(base)} className="font-medium text-[#0b1f3a] underline">Clear the filter</Link>
    </div>
  );
}
