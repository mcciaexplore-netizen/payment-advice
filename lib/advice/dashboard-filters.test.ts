import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { stageFilterLabel, baseFilterCondition, dashboardCountFields, dashboardFilterCondition, decisionCondition, hasActiveFilters, parseDashboardFilters, readDashboardCounts, searchCondition, submittedRangeConditions } from "@/lib/advice/dashboard-filters";

const render = (condition: SQL | undefined) => new PgDialect().sqlToQuery(condition!);

describe("URL state", () => {
  it("reads stage, decision, search and dates; ignores anything unknown or malformed", () => {
    expect(parseDashboardFilters({ stage: "received_in_process", decision: "sent_back", q: "  Fintric ", dateFrom: "2026-10-01", dateTo: "2026-10-31" }, { decision: true }))
      .toEqual({ stage: "received_in_process", decision: "sent_back", q: "Fintric", dateFrom: "2026-10-01", dateTo: "2026-10-31" });
    expect(parseDashboardFilters({ stage: "nonsense", decision: "approved", q: "   ", dateFrom: "2026-02-30", dateTo: "31/10/2026" }, { decision: true })).toEqual({});
    expect(parseDashboardFilters({ stage: "all" }, { decision: true })).toEqual({});
  });

  it("Decision is only read where the tab has a Decision column (History)", () => {
    expect(parseDashboardFilters({ decision: "rejected" }, { decision: false }).decision).toBeUndefined();
  });

  it("a long search is cut to 100 characters; arrays use the first value", () => {
    expect(parseDashboardFilters({ q: "x".repeat(150) }, { decision: false }).q).toHaveLength(100);
    expect(parseDashboardFilters({ stage: ["sent_back", "rejected"] }, { decision: false }).stage).toBe("sent_back");
  });

  it("knows when any filter is active", () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ dateTo: "2026-10-31" })).toBe(true);
  });
});

describe("conditions", () => {
  it("search covers reference numbers, payee and particulars, case-insensitive, with wildcards escaped", () => {
    const { sql, params } = render(searchCondition("50%_off\\"));
    for (const column of ["serial_no", "cash_voucher_no", "advance_no", "payee_name", "nature_of_expenditure"]) expect(sql).toContain(`"payment_advices"."${column}" ilike $`);
    expect(params[0]).toBe("%50\\%\\_off\\\\%");
  });

  it("date range is inclusive by IST calendar day on the submitted time", () => {
    const [from, to] = submittedRangeConditions("2026-10-01", "2026-10-31");
    expect(render(from).sql).toContain('"payment_advices"."submitted_at" >= $');
    expect(render(from).params[0]).toBe(new Date("2026-09-30T18:30:00.000Z").toISOString());
    expect(render(to).sql).toContain('"payment_advices"."submitted_at" < $');
    expect(render(to).params[0]).toBe(new Date("2026-10-31T18:30:00.000Z").toISOString());
  });

  it("decision matches the History column: Rejected, else Recommended when recommended, else Sent Back", () => {
    expect(render(decisionCondition("rejected")).sql).toContain("\"payment_advices\".\"status\" = 'REJECTED'");
    expect(render(decisionCondition("recommended")).sql).toContain('"payment_advices"."authority_approved_at" is not null');
    expect(render(decisionCondition("sent_back")).sql).toContain('"payment_advices"."authority_approved_at" is null');
    expect(render(decisionCondition("sent_back")).sql).toContain('"payment_advices"."status" <> $');
  });

  it("filters combine with AND: stage, decision, search and dates", () => {
    const { sql } = render(dashboardFilterCondition({ stage: "sent_back", decision: "sent_back", q: "abc", dateFrom: "2026-10-01" }));
    expect(sql).toContain("ilike");
    expect(sql).toContain('"payment_advices"."submitted_at" >= $');
    expect(sql).toContain('"payment_advices"."status" = $');
    expect(sql).toContain('"payment_advices"."authority_approved_at" is null');
    expect(dashboardFilterCondition({})).toBeUndefined();
    expect(baseFilterCondition({ stage: "sent_back" })).toBeUndefined();
  });
});

describe("counts", () => {
  it("one count per stage and decision, each in a FILTER clause; stage counts ignore the chosen stage, decision counts ignore the chosen decision", () => {
    const fields = dashboardCountFields({ stage: "rejected", decision: "recommended", q: "abc" });
    expect(Object.keys(fields)).toEqual(expect.arrayContaining(["total", "all", "stage_waiting_authority", "stage_rejected", "decision_recommended", "decision_sent_back", "decision_rejected"]));
    const stageSql = render(fields.stage_sent_back).sql;
    expect(stageSql).toContain("count(*) filter (where");
    expect(stageSql).toContain("ilike");
    expect(stageSql).toContain('"payment_advices"."authority_approved_at" is not null');
    const decisionQuery = render(fields.decision_sent_back);
    expect(decisionQuery.sql).toContain('"payment_advices"."status" = $6');
    expect(decisionQuery.params[5]).toBe("REJECTED");
    expect(decisionQuery.sql).not.toContain('"payment_advices"."authority_approved_at" is not null');
    expect(render(fields.total).sql).toBe("count(*)::int");
  });

  it("reads a count row, treating anything missing as 0", () => {
    const counts = readDashboardCounts({ total: 7, all: "5", stage_sent_back: 2, decision_rejected: 1 });
    expect(counts.total).toBe(7);
    expect(counts.all).toBe(5);
    expect(counts.stages.sent_back).toBe(2);
    expect(counts.stages.rejected).toBe(0);
    expect(counts.decisions.rejected).toBe(1);
    expect(readDashboardCounts(undefined).all).toBe(0);
  });
});

describe("stage names", () => {
  it("names every stage exactly as the filter buttons do", () => {
    expect(stageFilterLabel("Received & In Process")).toBe("Received & In Process");
    expect(stageFilterLabel("Payment Done")).toBe("Payment Done (Cash)");
    expect(stageFilterLabel("Verified - Ready for Payment")).toBe("Verified - Ready for Payment");
    expect(stageFilterLabel("Waiting on Authority")).toBe("Waiting on Authority");
  });
});
