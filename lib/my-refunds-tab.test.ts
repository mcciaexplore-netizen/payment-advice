import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The My Third Party Refunds tab, rendered through the real dashboard page against a
 * fake DB that records every query: each role sees only refunds made with its
 * own login email, the tab exists only while refunds are switched on, and
 * nothing else on the page changes. */
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
            : query.table === schema.recommendingAuthorities ? [{ authorityName: "Head Admin" }]
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
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ");
const refundQuery = () => state.queries.find((query) => query.table === refundRequests);
const refundWhere = () => new PgDialect().sqlToQuery(refundQuery()!.where as SQL);

const REFUND = (n: number) => ({ id: `${n}1111111-1111-4111-8111-111111111111`, serialNo: `REF/MCCIA/2026-27/000${n}`, requestDate: "2026-11-17", payeeName: `Payee ${n}`, nature: `Reason ${n}`, totalAmount: "4720.00" });

beforeEach(() => { state.refunds = [REFUND(7), REFUND(6)]; });
afterEach(() => vi.unstubAllEnvs());

describe("My Third Party Refunds tab", () => {
  beforeEach(() => vi.stubEnv("REFUND_REQUESTS_ENABLED", "true"));

  it.each(Object.keys(ROLES) as (keyof typeof ROLES)[])("%s: lists the refunds made with the login email, with a PDF link each, and only reads the refund table by that email", async (role) => {
    const html = await render(role, { view: "my-refunds" });
    const where = refundWhere();
    expect(where.sql).toContain('lower("refund_requests"."submitted_by_email") = lower($');
    expect(where.params).toEqual(["me@mcciapune.com"]);
    const page = text(html);
    expect(page).toContain("2 third party refund requests made using me@mcciapune.com, total ₹ 9,440.00");
    expect(page).toContain("REF/MCCIA/2026-27/0007");
    expect(page).toContain("Payee 7");
    expect(page).toContain("Reason 7");
    expect(page).toContain("17/11/2026");
    expect(html).toContain('href="/api/refund/71111111-1111-4111-8111-111111111111/pdf"');
    expect(html).toContain('href="/api/refund/71111111-1111-4111-8111-111111111111/pdf?download=1"');
    // No Payment Advice rows are read on this tab at all.
    expect(state.queries.some((query) => query.table === refundRequests)).toBe(true);
  });

  it("a SELF user asking for a branch-wide view or another role's refunds still gets only their own email", async () => {
    await render("SELF", { role: "BRANCH", view: "my-refunds" });
    expect(refundWhere().params).toEqual(["me@mcciapune.com"]);
    expect(refundWhere().sql).not.toContain("branch");
  });

  it("shows a clear empty state naming the email to use", async () => {
    state.refunds = [];
    const page = text(await render("SELF", { view: "my-refunds" }));
    expect(page).toContain("0 third party refund requests made using me@mcciapune.com");
    expect(page).toContain('No third party refund requests found for your login email. A third party refund shows here when the "Your Email" on its form is me@mcciapune.com.');
  });

  it("the My Third Party Refunds tab sits beside My Submissions for every role, and is the active tab on its own page", async () => {
    for (const role of Object.keys(ROLES) as (keyof typeof ROLES)[]) {
      const submissions = await render(role, { view: "my-submissions" });
      expect(submissions).toContain(">My Third Party Refunds<");
      expect(submissions).toContain("view=my-refunds");
      const refunds = await render(role, { view: "my-refunds" });
      expect(refunds).toMatch(/border-b-2 border-\[#0b1f3a\][^>]*>My Third Party Refunds</);
    }
  });
});

describe("while refunds are switched off", () => {
  it("there is no My Third Party Refunds tab, and asking for it falls back to the normal view without reading refunds", async () => {
    vi.stubEnv("REFUND_REQUESTS_ENABLED", "");
    const submissions = await render("SELF", { view: "my-submissions" });
    expect(submissions).not.toContain("My Third Party Refunds");
    const refunds = await render("SELF", { view: "my-refunds" });
    expect(refunds).not.toContain("My Third Party Refunds");
    expect(refundQuery()).toBeUndefined();
  });

  it("resolveDashboardView only returns my-refunds when it is enabled", () => {
    const grant = { role: "SELF", recommendingAuthorityId: null, scopeValue: null } as const;
    expect(resolveDashboardView(grant, "my-refunds", false).view).toBe("my-submissions");
    expect(resolveDashboardView(grant, "my-refunds", false, true).view).toBe("my-refunds");
    expect(resolveDashboardView({ role: "AUTHORITY", recommendingAuthorityId: "a", scopeValue: null }, "my-refunds", false, true).view).toBe("my-refunds");
    expect(resolveDashboardView({ role: "AUTHORITY", recommendingAuthorityId: "a", scopeValue: null }, "my-refunds", false).view).toBe("pending");
  });
});
