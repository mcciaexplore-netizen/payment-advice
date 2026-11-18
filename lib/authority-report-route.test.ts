import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** The Excel report route against a fake DB that records every query, so we
 * can check the report keeps each role's scope, applies the same filters and
 * sort as the table, and refuses anything it has no business exporting. */
const state = vi.hoisted(() => ({
  session: null as unknown,
  account: [{ email: "me@mcciapune.com" }] as unknown[],
  roleRows: [] as unknown[],
  rows: [] as unknown[],
  queries: [] as Array<{ table: unknown; where?: unknown; order?: unknown[] }>,
}));

vi.mock("@/lib/admin-session", () => ({ getAdminSession: async () => state.session }));
vi.mock("@/lib/date-time", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/date-time")>()), todayInIst: () => "2026-11-18" }));
vi.mock("@/lib/db", async () => {
  const schema = await vi.importActual<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  return {
    db: {
      select: () => {
        const query: { table: unknown; where?: unknown; order?: unknown[] } = { table: undefined };
        state.queries.push(query);
        const node: Record<string, unknown> = {};
        node.from = (table: unknown) => { query.table = table; return node; };
        node.leftJoin = () => node;
        node.where = (where: unknown) => { query.where = where; return node; };
        node.limit = () => node;
        node.orderBy = (...order: unknown[]) => { query.order = order; return node; };
        node.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve(query.table === schema.adminUsers ? state.account : query.table === schema.adminUserRoles ? state.roleRows : state.rows).then(resolve, reject);
        return node;
      },
    },
  };
});

import { paymentAdvices } from "@/lib/db/schema";
import { GET } from "../app/api/authority/report/route";

const ME = "me@mcciapune.com";
const ROLES = {
  AUTHORITY: { session: { adminUserId: "u", fullName: "A", roles: ["AUTHORITY"], recommendingAuthorityId: "auth-1" }, roleRows: [{ role: "AUTHORITY", recommendingAuthorityId: "auth-1", scopeValue: null }] },
  BRANCH: { session: { adminUserId: "u", fullName: "B", roles: ["BRANCH"], recommendingAuthorityId: null }, roleRows: [{ role: "BRANCH", recommendingAuthorityId: null, scopeValue: "Bhosari Office" }] },
  SELF: { session: { adminUserId: "u", fullName: "S", roles: ["SELF"], recommendingAuthorityId: null }, roleRows: [{ role: "SELF", recommendingAuthorityId: null, scopeValue: null }] },
} as const;

const row = (n: number) => ({
  serialNo: `MCCIA/2026-27/000${n}`, cashVoucherNo: null, advanceNo: null, isAdvance: false, paymentMode: "NEFT", payeeName: `Payee ${n}`, nature: "Supplies",
  amount: `${n}000.00`, billNo: "B", submittedBy: "Someone", submittedByDepartment: "AI STUDIO", branch: "SB Road Office", authorityName: "Neeraj",
  submittedAt: new Date("2026-10-12T04:00:00Z"), status: "SUBMITTED", approvedAt: null, rejectedAt: null, financeReceivedAt: null, verifiedAt: null,
  paymentDoneAt: null, totalPaid: "0", revisionCount: 0, authorityRemarks: null, adminRemarks: null, finalRejectedAt: null, finalRejectionRemarks: null,
});

function request(role: keyof typeof ROLES, query: Record<string, string>) {
  state.session = ROLES[role].session;
  state.roleRows = [...ROLES[role].roleRows];
  state.queries = [];
  return GET(new NextRequest(`http://localhost/api/authority/report?${new URLSearchParams({ role, ...query })}`));
}
const rowsQuery = () => state.queries.find((query) => query.table === paymentAdvices)!;
const whereSql = () => new PgDialect().sqlToQuery(rowsQuery().where as SQL);
const orderSql = () => (rowsQuery().order as SQL[]).map((part) => new PgDialect().sqlToQuery(part).sql);

beforeEach(() => {
  state.session = null;
  state.account = [{ email: ME }];
  state.rows = [row(1), row(2)];
});

describe("GET /api/authority/report", () => {
  it("refuses a request with no session or no dashboard role", async () => {
    state.session = null;
    expect((await GET(new NextRequest("http://localhost/api/authority/report?view=my-submissions"))).status).toBe(401);
    state.session = ROLES.SELF.session;
    state.roleRows = [];
    expect((await GET(new NextRequest("http://localhost/api/authority/report?view=my-submissions"))).status).toBe(401);
  });

  it("returns a real .xlsx with one row per submission for My Submissions", async () => {
    const response = await request("SELF", { view: "my-submissions" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="my-submissions-2026-11-18.xlsx"');
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()) as unknown as ArrayBuffer);
    expect(workbook.worksheets[0].rowCount).toBe(3);
  });

  it.each([
    ["SELF my-submissions", "SELF", "my-submissions", '"payment_advices"."submitted_by_email" = $', ME],
    ["AUTHORITY my-submissions", "AUTHORITY", "my-submissions", '"payment_advices"."submitted_by_email" = $', ME],
    ["AUTHORITY history", "AUTHORITY", "history", '"payment_advices"."recommending_authority_id" = $', "auth-1"],
    ["BRANCH team-submissions", "BRANCH", "team-submissions", 'lower("payment_advices"."branch") = lower($', "Bhosari Office"],
  ] as const)("%s: the report keeps the same scope as the table, even with every filter on", async (_label, role, view, fragment, value) => {
    await request(role, { view, stage: "rejected", q: "Payee", dateFrom: "2026-10-01", dateTo: "2026-10-31", sort: "amount_desc" });
    expect(whereSql().sql).toContain(fragment);
    expect(whereSql().params).toContain(value);
    expect(whereSql().sql).toContain("ilike");
  });

  it("a SELF user asking for a branch-wide view or another role still only exports their own submissions", async () => {
    const response = await request("SELF", { role: "BRANCH", view: "team-submissions" });
    expect(response.status).toBe(200);
    expect(whereSql().sql).toContain('"payment_advices"."submitted_by_email" = $');
    expect(whereSql().sql).not.toContain('"payment_advices"."branch"');
    expect(whereSql().params).toContain(ME);
  });

  it("applies the chosen sort in SQL, matching the table; no sort falls back to newest first", async () => {
    await request("SELF", { view: "my-submissions", sort: "amount_desc" });
    expect(orderSql()).toEqual(['"payment_advices"."amount" desc', '"payment_advices"."submitted_at" desc']);
    await request("SELF", { view: "my-submissions", sort: "bogus" });
    expect(orderSql()).toEqual(['"payment_advices"."submitted_at" desc']);
  });

  it("has no report for Pending My Recommendation or Cash Receipts", async () => {
    expect((await request("AUTHORITY", { view: "pending" })).status).toBe(400);
    expect((await request("AUTHORITY", {})).status).toBe(400);
    expect((await request("BRANCH", { view: "cash-receipts" })).status).toBe(400);
  });
});
