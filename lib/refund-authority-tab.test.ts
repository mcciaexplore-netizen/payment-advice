import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The Refund Requests tab for recommending authorities, rendered through the
 * real dashboard page against a fake DB that records every query: an
 * authority sees the refunds that name them (matched by the authority's own
 * name from their account, never from the URL), nobody else can reach the
 * tab, and with refunds switched off nothing changes. */
const state = vi.hoisted(() => ({
  session: null as unknown,
  roleRows: [] as unknown[],
  refunds: [] as unknown[],
  queries: [] as Array<{ table: unknown; where?: unknown }>,
}));

vi.mock("@/lib/admin-session", () => ({ getAdminSession: async () => state.session }));
vi.mock("@/lib/db", async () => {
  const schema = await vi.importActual<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  return {
    db: {
      select: (fields?: Record<string, unknown>) => {
        const query: { table: unknown; where?: unknown } = { table: undefined };
        state.queries.push(query);
        const node: Record<string, unknown> = {};
        node.from = (table: unknown) => { query.table = table; return node; };
        node.where = (where: unknown) => { query.where = where; return node; };
        for (const method of ["orderBy", "leftJoin", "limit"]) node[method] = () => node;
        node.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
          const result = query.table === schema.adminUsers ? [{ email: "me@mcciapune.com" }]
            : query.table === schema.adminUserRoles ? state.roleRows
            : query.table === schema.recommendingAuthorities ? [{ authorityName: "Head  Admin" }]
            : query.table === schema.refundRequests ? state.refunds
            : query.table === schema.paymentAdvices && fields && "total" in fields ? [{}]
            : [];
          return Promise.resolve(result).then(resolve, reject);
        };
        return node;
      },
    },
  };
});

import { refundRequests } from "@/lib/db/schema";
import { resolveDashboardView } from "@/lib/advice/dashboard-scope";
import { refundsForAuthorityWhere } from "@/lib/advice/refund-authority";
import TeamDashboard from "../app/authority/page";

const ROLES = {
  AUTHORITY: { session: { adminUserId: "u", fullName: "A", roles: ["AUTHORITY"], recommendingAuthorityId: "auth-1" }, roleRows: [{ role: "AUTHORITY", recommendingAuthorityId: "auth-1", scopeValue: null }] },
  BRANCH: { session: { adminUserId: "u", fullName: "B", roles: ["BRANCH"], recommendingAuthorityId: null }, roleRows: [{ role: "BRANCH", recommendingAuthorityId: null, scopeValue: "Bhosari Office" }] },
  DEPARTMENT: { session: { adminUserId: "u", fullName: "D", roles: ["DEPARTMENT"], recommendingAuthorityId: null }, roleRows: [{ role: "DEPARTMENT", recommendingAuthorityId: null, scopeValue: "CBP" }] },
  SELF: { session: { adminUserId: "u", fullName: "S", roles: ["SELF"], recommendingAuthorityId: null }, roleRows: [{ role: "SELF", recommendingAuthorityId: null, scopeValue: null }] },
} as const;

async function render(role: keyof typeof ROLES, params: Record<string, string>) {
  state.session = ROLES[role].session;
  state.roleRows = [...ROLES[role].roleRows];
  state.queries = [];
  const element = await TeamDashboard({ searchParams: Promise.resolve({ role, ...params }) });
  return renderToStaticMarkup(element!);
}
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const refundQuery = () => state.queries.find((query) => query.table === refundRequests);
const refundWhere = () => new PgDialect().sqlToQuery(refundQuery()!.where as SQL);

const REFUND = (n: number) => ({
  id: `${n}1111111-1111-4111-8111-111111111111`, serialNo: `REF/MCCIA/2026-27/000${n}`, requestDate: "2026-11-17",
  submittedByName: `Submitter ${n}`, submittedByEmail: `submitter${n}@mcciapune.com`, department: "CBP", branch: "SB Road Office",
  payeeName: `Payee ${n}`, nature: `Reason ${n}`, totalAmount: "4720.00",
});

beforeEach(() => { state.refunds = [REFUND(7), REFUND(6)]; });
afterEach(() => vi.unstubAllEnvs());

describe("Refund Requests tab for a recommending authority", () => {
  beforeEach(() => vi.stubEnv("REFUND_REQUESTS_ENABLED", "true"));

  it("lists the refunds that name the authority, with who submitted them and a PDF link each", async () => {
    const html = await render("AUTHORITY", { view: "refund-requests" });
    const page = text(html);
    expect(page).toContain("2 third party refund requests naming you as the recommending authority, total ₹ 9,440.00");
    expect(page).toContain("REF/MCCIA/2026-27/0007");
    expect(page).toContain("Submitter 7");
    expect(page).toContain("submitter7@mcciapune.com");
    expect(page).toContain("CBP, SB Road Office");
    expect(page).toContain("Payee 7");
    expect(page).toContain("Reason 7");
    expect(page).toContain("17/11/2026");
    expect(html).toContain('href="/api/refund/71111111-1111-4111-8111-111111111111/pdf"');
    expect(html).toContain('href="/api/refund/71111111-1111-4111-8111-111111111111/pdf?download=1"');
  });

  it("matches on the authority's own name from their account, ignoring case and extra spaces, never a value from the URL", async () => {
    await render("AUTHORITY", { view: "refund-requests", authority: "Someone Else", q: "Someone Else" });
    const where = refundWhere();
    expect(where.sql).toContain('lower(regexp_replace(btrim("refund_requests"."recommending_authority")');
    expect(where.sql).toContain("regexp_replace(btrim($1)");
    // The authority record's own name (note its double space) is the only value bound.
    expect(where.params).toEqual(["Head  Admin"]);
  });

  it("the match normalises both sides the same way", () => {
    const { sql } = new PgDialect().sqlToQuery(refundsForAuthorityWhere("RAJNIKANT  GAIKWAD"));
    expect(sql.match(/regexp_replace\(btrim\(/g)).toHaveLength(2);
    expect(sql.match(/lower\(/g)).toHaveLength(2);
  });

  it("shows a clear empty state when no refund names the authority", async () => {
    state.refunds = [];
    const page = text(await render("AUTHORITY", { view: "refund-requests" }));
    expect(page).toContain("0 third party refund requests naming you as the recommending authority");
    expect(page).toContain("No third party refund requests name you as the recommending authority.");
  });

  it("the tab is offered in the authority's tab bar and is the active one on its own page", async () => {
    const pending = await render("AUTHORITY", { view: "pending" });
    expect(pending).toContain(">Refund Requests<");
    expect(pending).toContain("view=refund-requests");
    const own = await render("AUTHORITY", { view: "refund-requests" });
    expect(own).toMatch(/border-b-2 border-\[#0b1f3a\][^>]*>Refund Requests</);
    const mine = await render("AUTHORITY", { view: "my-refunds" });
    expect(mine).toContain(">Refund Requests<");
    expect((mine.match(/>My Third Party Refunds</g) ?? []).length).toBe(1);
  });

  it.each(["BRANCH", "DEPARTMENT", "SELF"] as const)("%s can neither see the tab nor reach the view: it falls back to their normal page without reading refunds", async (role) => {
    const normal = await render(role, { view: "my-submissions" });
    expect(normal).not.toContain("Refund Requests");
    const asked = await render(role, { view: "refund-requests" });
    expect(asked).not.toContain("Refund Requests");
    expect(asked).not.toContain("naming you as the recommending authority");
    expect(refundQuery()).toBeUndefined();
  });
});

describe("while refunds are switched off", () => {
  it("the authority has no Refund Requests tab and asking for it reads no refunds", async () => {
    vi.stubEnv("REFUND_REQUESTS_ENABLED", "");
    const pending = await render("AUTHORITY", { view: "pending" });
    expect(pending).not.toContain("Refund Requests");
    const asked = await render("AUTHORITY", { view: "refund-requests" });
    expect(asked).not.toContain("naming you as the recommending authority");
    expect(refundQuery()).toBeUndefined();
  });

  it("resolveDashboardView only returns refund-requests for an authority, and only when refunds are enabled", () => {
    const authority = { role: "AUTHORITY", recommendingAuthorityId: "a", scopeValue: null } as const;
    expect(resolveDashboardView(authority, "refund-requests", false, true).view).toBe("refund-requests");
    expect(resolveDashboardView(authority, "refund-requests", false, false).view).toBe("pending");
    for (const role of ["BRANCH", "DEPARTMENT", "SELF", "CASH_RECEIPT"] as const) {
      const grant = { role, recommendingAuthorityId: null, scopeValue: role === "BRANCH" || role === "DEPARTMENT" || role === "CASH_RECEIPT" ? "X" : null };
      expect(resolveDashboardView(grant, "refund-requests", false, true).view).not.toBe("refund-requests");
    }
  });
});
