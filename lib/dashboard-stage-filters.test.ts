import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Renders the real Authority / Team dashboard (app/authority/page.tsx)
 * against a fake DB that records every query, so the new filters can be
 * checked for each role without touching the shared database: every query
 * on payment_advices must still carry the role's own scope, filters only
 * add conditions on top of it, and counts come from that same scope. */
const state = vi.hoisted(() => ({
  session: null as unknown,
  roleRows: [] as unknown[],
  rows: [] as unknown[],
  counts: {} as Record<string, number>,
  queries: [] as Array<{ table: unknown; fields: Record<string, unknown> | undefined; where: unknown; limited: boolean }>,
}));

vi.mock("@/lib/admin-session", () => ({ getAdminSession: async () => state.session }));
vi.mock("@/lib/db", async () => {
  const schema = await vi.importActual<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  function resultFor(table: unknown, fields: Record<string, unknown> | undefined) {
    if (table === schema.adminUsers) return [{ email: "me@mcciapune.com" }];
    if (table === schema.adminUserRoles) return state.roleRows;
    if (table === schema.recommendingAuthorities) return [{ authorityName: "Head Admin" }];
    if (table === schema.paymentAdvices) {
      if (fields && "total" in fields) return [state.counts];
      if (fields && "count" in fields) return [{ count: 0, sum: null }];
      return state.rows;
    }
    return [];
  }
  return {
    db: {
      select: (fields?: Record<string, unknown>) => {
        const query = { table: undefined as unknown, fields, where: undefined as unknown, limited: false };
        state.queries.push(query);
        const node: Record<string, unknown> = {};
        node.from = (value: unknown) => { query.table = value; return node; };
        node.where = (value: unknown) => { query.where = value; return node; };
        node.limit = () => { query.limited = true; return node; };
        for (const method of ["orderBy", "leftJoin"]) node[method] = () => node;
        node.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(resultFor(query.table, fields)).then(resolve, reject);
        return node;
      },
    },
  };
});

import { paymentAdvices } from "@/lib/db/schema";
import TeamDashboard from "../app/authority/page";

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);
const advice = (n: number, extra: Record<string, unknown> = {}) => ({
  id: `${n}1111111-1111-4111-8111-111111111111`, serialNo: `MCCIA/2026-27/000${n}`, cashVoucherNo: null, advanceNo: null, isAdvance: false, paymentMode: "NEFT",
  payeeName: `Payee ${n}`, amount: "1000.00", nature: "Office supplies", submittedBy: "Someone", submittedAt: daysAgo(5), status: "SUBMITTED",
  approvedAt: daysAgo(4), rejectedAt: null, authorityRemarks: null, adminRemarks: null, editToken: null, editTokenExpiresAt: null,
  financeReceivedAt: daysAgo(3), verifiedAt: null, paymentDoneAt: null, totalPaid: "0", revisionCount: 0, updatedAt: daysAgo(3),
  sentBackAt: null, finalRejectedAt: null, finalRejectedBy: null, finalRejectionRemarks: null, ...extra,
});

const ROLES = {
  AUTHORITY: { session: { adminUserId: "u", fullName: "A", roles: ["AUTHORITY"], recommendingAuthorityId: "auth-1" }, roleRows: [{ role: "AUTHORITY", recommendingAuthorityId: "auth-1", scopeValue: null }] },
  BRANCH: { session: { adminUserId: "u", fullName: "B", roles: ["BRANCH"], recommendingAuthorityId: null }, roleRows: [{ role: "BRANCH", recommendingAuthorityId: null, scopeValue: "Bhosari Office" }] },
  DEPARTMENT: { session: { adminUserId: "u", fullName: "D", roles: ["DEPARTMENT"], recommendingAuthorityId: null }, roleRows: [{ role: "DEPARTMENT", recommendingAuthorityId: null, scopeValue: "Library" }] },
  SELF: { session: { adminUserId: "u", fullName: "S", roles: ["SELF"], recommendingAuthorityId: null }, roleRows: [{ role: "SELF", recommendingAuthorityId: null, scopeValue: null }] },
} as const;

/** The scope each tab must keep: SQL fragment and the value it binds. */
const OWN = { sql: '"payment_advices"."submitted_by_email" = $', value: "me@mcciapune.com" };
const SCOPES = {
  "AUTHORITY history": { role: "AUTHORITY", view: "history", scope: { sql: '"payment_advices"."recommending_authority_id" = $', value: "auth-1" } },
  "AUTHORITY my-submissions": { role: "AUTHORITY", view: "my-submissions", scope: OWN },
  "BRANCH team-submissions": { role: "BRANCH", view: "team-submissions", scope: { sql: 'lower("payment_advices"."branch") = lower($', value: "Bhosari Office" } },
  "BRANCH my-submissions": { role: "BRANCH", view: "my-submissions", scope: OWN },
  "DEPARTMENT team-submissions": { role: "DEPARTMENT", view: "team-submissions", scope: { sql: 'lower("payment_advices"."submitted_by_department") = lower($', value: "Library" } },
  "DEPARTMENT my-submissions": { role: "DEPARTMENT", view: "my-submissions", scope: OWN },
  "SELF my-submissions": { role: "SELF", view: "my-submissions", scope: OWN },
} as const;

async function render(role: keyof typeof ROLES, params: Record<string, string>) {
  state.session = ROLES[role].session;
  state.roleRows = [...ROLES[role].roleRows];
  state.queries = [];
  const element = await TeamDashboard({ searchParams: Promise.resolve({ role, ...params }) });
  return renderToStaticMarkup(element!);
}
const adviceQueries = () => state.queries.filter((query) => query.table === paymentAdvices).map((query) => ({ ...new PgDialect().sqlToQuery(query.where as SQL), fields: query.fields, limited: query.limited }));
const rowsQuery = () => adviceQueries().find((query) => query.fields && "payeeName" in query.fields)!;
const countQuery = () => adviceQueries().find((query) => query.fields && "total" in query.fields)!;
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const ALL_FILTERS = { stage: "received_in_process", decision: "recommended", q: "Payee", dateFrom: "2026-10-01", dateTo: "2026-10-31" };

beforeEach(() => {
  state.rows = [advice(1), advice(2)];
  state.counts = { total: 9, all: 2, stage_received_in_process: 2, stage_sent_back: 0, decision_recommended: 2 };
});

describe("filters never reach outside a user's scope", () => {
  it.each(Object.entries(SCOPES))("%s: every payment_advices query (rows, counts, summary) keeps the scope, with all filters applied", async (_label, { role, view, scope }) => {
    await render(role as keyof typeof ROLES, { view, ...ALL_FILTERS });
    const queries = adviceQueries();
    expect(queries.length).toBeGreaterThanOrEqual(2);
    for (const query of queries) {
      expect(query.sql).toContain(scope.sql);
      expect(query.params).toContain(scope.value);
    }
    // Counts run over the scope alone; the filters live in their FILTER clauses.
    expect(countQuery().sql).not.toContain("ilike");
    expect(countQuery().sql).not.toContain("submitted_at");
    const allCount = new PgDialect().sqlToQuery(countQuery().fields!.all as SQL).sql;
    expect(allCount).toContain("count(*) filter (where");
    expect(allCount).toContain("ilike");
    expect(rowsQuery().sql).toContain("ilike");
    expect(rowsQuery().sql).toContain('"payment_advices"."submitted_at" >= $');
  });

  it("a SELF user asking for a branch-wide view or another role still only gets their own submissions", async () => {
    await render("SELF", { role: "BRANCH", view: "team-submissions", stage: "rejected" });
    for (const query of adviceQueries()) {
      expect(query.sql).toContain(OWN.sql);
      expect(query.sql).not.toContain('"payment_advices"."branch"');
    }
  });

  it("filters only add conditions: the rows query is the scope AND the filters", async () => {
    await render("BRANCH", { view: "team-submissions" });
    const plain = rowsQuery().sql;
    await render("BRANCH", { view: "team-submissions", stage: "sent_back", q: "x" });
    const filtered = rowsQuery().sql;
    expect(filtered).toContain(plain);
    expect(filtered.length).toBeGreaterThan(plain.length);
  });

  it("the whole list is filtered and counted: no page limit on the rows or count queries", async () => {
    await render("BRANCH", { view: "team-submissions", stage: "received_in_process" });
    expect(rowsQuery().limited).toBe(false);
    expect(countQuery().limited).toBe(false);
  });
});

describe("filter buttons, URL state and empty state", () => {
  it("shows All and only the stages that have rows, each with its count; History also gets the Decision filter", async () => {
    const html = await render("AUTHORITY", { view: "history" });
    const visible = text(html);
    expect(visible).toContain("All (2)");
    expect(visible).toContain("Received & In Process (2)");
    expect(visible).not.toContain("Sent Back (0)");
    expect(html).toContain('aria-label="Filter by decision"');
    expect(visible).toContain("Recommended (2)");
    expect(visible).toContain("Your previous recommendation decisions");
  });

  it("My Submissions and Team Submissions have the stage filter but no Decision filter; Pending has none and ignores filter params", async () => {
    for (const [role, view] of [["AUTHORITY", "my-submissions"], ["BRANCH", "team-submissions"], ["DEPARTMENT", "my-submissions"], ["SELF", "my-submissions"]] as const) {
      const html = await render(role, { view });
      expect(html).toContain('aria-label="Filter by stage"');
      expect(html).not.toContain('aria-label="Filter by decision"');
    }
    const pending = await render("AUTHORITY", { stage: "rejected", q: "zzz" });
    expect(pending).not.toContain('aria-label="Filter by stage"');
    expect(countQuery()).toBeUndefined();
    expect(rowsQuery().sql).not.toContain("ilike");
  });

  it("the selected stage is marked, and every filter link keeps the other filters and the tab", async () => {
    const html = await render("AUTHORITY", { view: "history", stage: "received_in_process", decision: "recommended", q: "Payee" });
    expect(html).toMatch(/<a aria-current="true"[^>]*href="\/authority\?role=AUTHORITY&amp;view=history&amp;stage=received_in_process&amp;decision=recommended&amp;q=Payee"/);
    expect(html).toContain('href="/authority?role=AUTHORITY&amp;view=history&amp;decision=recommended&amp;q=Payee"');
    expect(html).toContain('href="/authority?role=AUTHORITY&amp;view=history&amp;stage=received_in_process&amp;q=Payee"');
    expect(html).toContain('<input type="hidden" name="stage" value="received_in_process"/>');
    expect(html).toContain('name="q" value="Payee"');
  });

  it("switching tabs resets to All: tab links carry no filter", async () => {
    const html = await render("BRANCH", { view: "team-submissions", stage: "sent_back", q: "x" });
    expect(html).toContain('href="/authority?role=BRANCH&amp;view=my-submissions"');
    expect(html).toContain('href="/authority?role=BRANCH"');
  });

  it("the subtitle keeps counting the whole tab, not the filtered rows", async () => {
    const html = await render("BRANCH", { view: "team-submissions", stage: "received_in_process" });
    expect(text(html)).toContain("9 submissions in Bhosari Office");
  });

  it("no rows after filtering: 'No submissions in this stage' with a link that clears the filter", async () => {
    state.rows = [];
    state.counts = { total: 9, all: 4, stage_received_in_process: 4 };
    let html = await render("SELF", { view: "my-submissions", stage: "sent_back", dateFrom: "2026-10-01" });
    expect(text(html)).toContain("No submissions in this stage. Clear the filter");
    expect(html).toContain('href="/authority?role=SELF&amp;view=my-submissions">Clear the filter');
    expect(text(html)).toContain("Sent Back (0)");
    html = await render("SELF", { view: "my-submissions", q: "nothing" });
    expect(text(html)).toContain("No submissions match these filters.");
  });

  it("a tab with no submissions at all keeps its original empty message and shows no filter", async () => {
    state.rows = [];
    state.counts = { total: 0, all: 0 };
    const html = await render("SELF", { view: "my-submissions" });
    expect(text(html)).toContain("No submissions found for your login email.");
    expect(html).not.toContain('aria-label="Filter by stage"');
  });
});
