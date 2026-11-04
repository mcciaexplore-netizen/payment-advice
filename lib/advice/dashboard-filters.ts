import { and, gte, ilike, isNotNull, isNull, lt, ne, or, sql, type SQL } from "drizzle-orm";
import { paymentAdvices } from "@/lib/db/schema";
import { buildTabCondition, isAdminTab, type AdminTab } from "@/lib/admin/filters";
import { PIPELINE_SUMMARY_STAGES } from "@/components/admin/PipelineSummary";
import { STAGE_FOR_TAB } from "@/lib/advice/stage-style";
import type { PipelineStage } from "@/lib/advice/pipeline-stage";
import { addCalendarDays } from "@/lib/date-time";

/** Filters for the Authority / Team dashboard tables (History, My
 * Submissions, Team Submissions). Every condition here is only ever ANDed
 * onto the dashboard's existing server-side scope, so a filter can narrow
 * what a user already sees but never widen it. */

export type StageTab = Exclude<AdminTab, "all">;

/** The History tab's Decision column, exactly as it is shown there. */
export const DECISIONS = [
  { value: "recommended", label: "Recommended" },
  { value: "sent_back", label: "Sent Back" },
  { value: "rejected", label: "Rejected" },
] as const;
export type Decision = (typeof DECISIONS)[number]["value"];

/** The stage filter's button name for a stage (e.g. "Payment Done (Cash)"),
 * so a table column can name a stage exactly as the filter does. */
export function stageFilterLabel(stage: PipelineStage): string {
  return PIPELINE_SUMMARY_STAGES.find(({ tab }) => STAGE_FOR_TAB[tab] === stage)?.label ?? stage;
}

export type DashboardFilters = { stage?: StageTab; decision?: Decision; q?: string; dateFrom?: string; dateTo?: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (value: string | undefined) => {
  if (!value || !DATE.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : undefined;
};
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Reads the filters from the URL; anything unknown or malformed is ignored. */
export function parseDashboardFilters(params: Record<string, string | string[] | undefined>, options: { decision: boolean }): DashboardFilters {
  const stage = first(params.stage);
  const decision = first(params.decision);
  const q = first(params.q)?.trim().slice(0, 100);
  return {
    stage: isAdminTab(stage) && stage !== "all" ? stage : undefined,
    decision: options.decision && DECISIONS.some((option) => option.value === decision) ? (decision as Decision) : undefined,
    q: q || undefined,
    dateFrom: validDate(first(params.dateFrom)),
    dateTo: validDate(first(params.dateTo)),
  };
}

export function hasActiveFilters(filters: DashboardFilters): boolean {
  return Boolean(filters.stage || filters.decision || filters.q || filters.dateFrom || filters.dateTo);
}

/** Decision as the History column shows it: Rejected when the submission is
 * finally rejected, else Recommended when the authority recommended it,
 * else Sent Back. */
export function decisionCondition(decision: Decision): SQL {
  if (decision === "rejected") return sql`${paymentAdvices.status} = 'REJECTED'`;
  const notRejected = ne(paymentAdvices.status, "REJECTED");
  return decision === "recommended"
    ? and(notRejected, isNotNull(paymentAdvices.authorityApprovedAt))!
    : and(notRejected, isNull(paymentAdvices.authorityApprovedAt))!;
}

/** Reference number (serial, Cash Voucher or Advance number), payee or
 * particulars, case-insensitive, with LIKE wildcards in the input escaped. */
export function searchCondition(q: string): SQL {
  const term = `%${q.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
  return or(
    ilike(paymentAdvices.serialNo, term),
    ilike(paymentAdvices.cashVoucherNo, term),
    ilike(paymentAdvices.advanceNo, term),
    ilike(paymentAdvices.payeeName, term),
    ilike(paymentAdvices.natureOfExpenditure, term),
  )!;
}

/** Submitted date range, inclusive, by the IST calendar day. */
export function submittedRangeConditions(dateFrom?: string, dateTo?: string): SQL[] {
  const conditions: SQL[] = [];
  if (dateFrom) conditions.push(gte(paymentAdvices.submittedAt, new Date(`${dateFrom}T00:00:00+05:30`)));
  if (dateTo) conditions.push(lt(paymentAdvices.submittedAt, new Date(`${addCalendarDays(dateTo, 1)}T00:00:00+05:30`)));
  return conditions;
}

/** Everything except stage and decision: these apply to every count. */
export function baseFilterCondition(filters: DashboardFilters): SQL | undefined {
  const conditions = [...(filters.q ? [searchCondition(filters.q)] : []), ...submittedRangeConditions(filters.dateFrom, filters.dateTo)];
  return conditions.length ? and(...conditions) : undefined;
}

/** All filters together, for the table rows. */
export function dashboardFilterCondition(filters: DashboardFilters): SQL | undefined {
  const conditions = [
    baseFilterCondition(filters),
    filters.stage ? buildTabCondition(filters.stage) : undefined,
    filters.decision ? decisionCondition(filters.decision) : undefined,
  ].filter((condition): condition is SQL => Boolean(condition));
  return conditions.length ? and(...conditions) : undefined;
}

export type DashboardCounts = { total: number; all: number; stages: Record<StageTab, number>; decisions: Record<Decision, number> };

const always = sql`true`;

/** Select list for one query over the dashboard's scope: `total` (the
 * scope, no filters), `all` (all filters except stage), one count per stage
 * (other filters applied, so the buttons always add up to `all` when no
 * stage is chosen) and one per decision (stage applied, decision not). */
export function dashboardCountFields(filters: DashboardFilters) {
  const base = baseFilterCondition(filters) ?? always;
  const decision = filters.decision ? decisionCondition(filters.decision) : always;
  const stage = filters.stage ? buildTabCondition(filters.stage) ?? always : always;
  const fields: Record<string, SQL<number>> = {
    total: sql<number>`count(*)::int`,
    all: sql<number>`count(*) filter (where ${base} and ${decision})::int`,
  };
  for (const { tab } of PIPELINE_SUMMARY_STAGES) fields[`stage_${tab}`] = sql<number>`count(*) filter (where ${base} and ${decision} and ${buildTabCondition(tab) ?? always})::int`;
  for (const { value } of DECISIONS) fields[`decision_${value}`] = sql<number>`count(*) filter (where ${base} and ${stage} and ${decisionCondition(value)})::int`;
  return fields;
}

export function readDashboardCounts(row: Record<string, unknown> | undefined): DashboardCounts {
  const value = (key: string) => Number(row?.[key] ?? 0) || 0;
  return {
    total: value("total"),
    all: value("all"),
    stages: Object.fromEntries(PIPELINE_SUMMARY_STAGES.map(({ tab }) => [tab, value(`stage_${tab}`)])) as Record<StageTab, number>,
    decisions: Object.fromEntries(DECISIONS.map(({ value: decision }) => [decision, value(`decision_${decision}`)])) as Record<Decision, number>,
  };
}
