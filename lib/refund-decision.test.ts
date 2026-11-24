import { NextRequest } from "next/server";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Recommend / Send back for a refund: the decision logic and its API route,
 * against a fake DB. Covers who may act (only the authority the refund names),
 * once-only decisions, required remarks, the audit entry and the email. */
const state = vi.hoisted(() => ({
  session: null as unknown,
  authorityRecord: [{ authorityName: "Aniruddha  Brahma" }] as unknown[],
  refund: [] as unknown[],
  insertedReview: true,
  reviewInserts: [] as Array<Record<string, unknown>>,
  auditInserts: [] as Array<Record<string, unknown>>,
  selectWheres: [] as Array<{ table: unknown; where: unknown }>,
  emailError: null as Error | null,
  emails: [] as Array<{ kind: string; data: Record<string, unknown>; to: string; id: string }>,
}));

vi.mock("@/lib/admin-session", () => ({ getAdminSession: async () => state.session }));
vi.mock("@/lib/email/notify", () => ({
  notifyRefundRecommended: async (data: Record<string, unknown>, to: string, id: string) => { if (state.emailError) throw state.emailError; state.emails.push({ kind: "recommended", data, to, id }); },
  notifyRefundSentBack: async (data: Record<string, unknown>, to: string, id: string) => { if (state.emailError) throw state.emailError; state.emails.push({ kind: "sentBack", data, to, id }); },
  notifyRefundAuthority: async () => undefined,
  notifyRefundSubmitted: async () => undefined,
}));
vi.mock("@/lib/db", async () => {
  const schema = await vi.importActual<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  return {
    db: {
      select: () => {
        const query: { table?: unknown } = {};
        const node: Record<string, unknown> = {};
        node.from = (table: unknown) => { query.table = table; return node; };
        node.where = (where: unknown) => { state.selectWheres.push({ table: query.table, where }); return node; };
        node.limit = () => Promise.resolve(query.table === schema.recommendingAuthorities ? state.authorityRecord : state.refund);
        return node;
      },
      transaction: async (callback: (tx: unknown) => unknown) => callback({
        insert: (table: unknown) => ({
          values: (values: Record<string, unknown>) => {
            if (table === schema.refundRequestReviews) state.reviewInserts.push(values);
            else state.auditInserts.push(values);
            return { onConflictDoNothing: () => ({ returning: async () => (state.insertedReview ? [{ id: values.refundRequestId }] : []) }), then: (resolve: (value: unknown) => unknown) => Promise.resolve(undefined).then(resolve) };
          },
        }),
      }),
    },
  };
});

import { POST } from "../app/api/authority/refund/[id]/decision/route";
import { refundDecisionSchema, refundStatusLabel } from "@/lib/advice/refund-review";

const ID = "71111111-1111-4111-8111-111111111111";
const AUTHORITY_SESSION = { adminUserId: "u", fullName: "A", roles: ["AUTHORITY"], recommendingAuthorityId: "auth-1" };
const REFUND = { id: ID, serialNo: "REF/MCCIA/2026-27/0007", requestDate: "2026-11-17", submittedByName: "Sandhya Acharya", submittedByEmail: "sandhyaa@mcciapune.com", payeeName: "Deccan", totalAmount: "4720.00" };

function call(body: unknown, id = ID) {
  return POST(new NextRequest(`http://localhost/api/authority/refund/${id}/decision`, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.0.5" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.stubEnv("REFUND_REQUESTS_ENABLED", "true");
  vi.stubEnv("REFUND_RECOMMENDATION_ENABLED", "true");
  state.session = AUTHORITY_SESSION;
  state.refund = [REFUND];
  state.insertedReview = true;
  state.reviewInserts = []; state.auditInserts = []; state.selectWheres = []; state.emails = []; state.emailError = null;
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/authority/refund/[id]/decision", () => {
  it("is off (404) until refund recommendation is switched on, and does nothing", async () => {
    vi.stubEnv("REFUND_RECOMMENDATION_ENABLED", "");
    expect((await call({ decision: "RECOMMEND" })).status).toBe(404);
    expect(state.reviewInserts).toHaveLength(0);
  });

  it("refuses anyone who is not an authority account (401), and does nothing", async () => {
    for (const session of [null, { adminUserId: "u", fullName: "S", roles: ["SELF"], recommendingAuthorityId: null }, { adminUserId: "u", fullName: "F", roles: ["ALL"], recommendingAuthorityId: null }]) {
      state.session = session;
      expect((await call({ decision: "RECOMMEND" })).status).toBe(401);
    }
    expect(state.reviewInserts).toHaveLength(0);
    expect(state.emails).toHaveLength(0);
  });

  it("recommends: records the decision against the signed-in authority, writes the audit entry and emails the submitter", async () => {
    const response = await call({ decision: "RECOMMEND" });
    expect(response.status).toBe(200);
    expect(state.reviewInserts).toEqual([{ refundRequestId: ID, decision: "RECOMMENDED", decidedByName: "Aniruddha  Brahma", decidedByAuthorityId: "auth-1", remarks: null }]);
    expect(state.auditInserts).toEqual([{ refundRequestId: ID, action: "REFUND_REQUEST_RECOMMENDED", actor: "Aniruddha  Brahma", ipAddress: "10.0.0.5", details: { serialNo: REFUND.serialNo, remarks: null } }]);
    expect(state.emails).toHaveLength(1);
    expect(state.emails[0]).toMatchObject({ kind: "recommended", to: "sandhyaa@mcciapune.com", id: ID });
    expect(state.emails[0].data).toMatchObject({ displayNo: REFUND.serialNo, recommendedBy: "Aniruddha  Brahma", amount: "4,720.00" });
  });

  it("sends back with remarks and tells the submitter to file a new refund", async () => {
    const response = await call({ decision: "SEND_BACK", remarks: "  Amount does not match  " });
    expect(response.status).toBe(200);
    expect(state.reviewInserts[0]).toMatchObject({ decision: "SENT_BACK", remarks: "Amount does not match" });
    expect(state.auditInserts[0]).toMatchObject({ action: "REFUND_REQUEST_SENT_BACK" });
    expect(state.emails[0]).toMatchObject({ kind: "sentBack", to: "sandhyaa@mcciapune.com" });
    expect(state.emails[0].data).toMatchObject({ remarks: "Amount does not match", newRefundLink: "http://localhost/refund" });
  });

  it("will not send back without remarks (400), and writes nothing", async () => {
    for (const body of [{ decision: "SEND_BACK" }, { decision: "SEND_BACK", remarks: "   " }, { decision: "REJECT" }, {}]) {
      expect((await call(body)).status).toBe(400);
    }
    expect(state.reviewInserts).toHaveLength(0);
  });

  it("a refund that does not name this authority is a 404 (matched on the account's own authority name, never the URL)", async () => {
    state.refund = [];
    const response = await call({ decision: "RECOMMEND" });
    expect(response.status).toBe(404);
    expect(state.reviewInserts).toHaveLength(0);
    const refundQuery = state.selectWheres[state.selectWheres.length - 1];
    const where = new PgDialect().sqlToQuery(refundQuery.where as SQL);
    expect(where.sql).toContain("regexp_replace(btrim(");
    expect(where.params).toContain("Aniruddha  Brahma");
    expect(where.params).toContain(ID);
  });

  it("a refund already decided is a 409, with no second audit entry and no second email", async () => {
    state.insertedReview = false;
    const response = await call({ decision: "RECOMMEND" });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("This refund request has already been decided.");
    expect(state.auditInserts).toHaveLength(0);
    expect(state.emails).toHaveLength(0);
  });

  it("a failed email never undoes the decision", async () => {
    state.emailError = new Error("smtp down");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await call({ decision: "RECOMMEND" })).status).toBe(200);
    expect(state.reviewInserts).toHaveLength(1);
  });

  it("an id that is not a UUID is a 404", async () => {
    expect((await call({ decision: "RECOMMEND" }, "not-a-uuid")).status).toBe(404);
  });
});

describe("decision helpers", () => {
  it("the schema needs remarks only for a send back", () => {
    expect(refundDecisionSchema.safeParse({ decision: "RECOMMEND" }).success).toBe(true);
    expect(refundDecisionSchema.safeParse({ decision: "SEND_BACK", remarks: "x" }).success).toBe(true);
    expect(refundDecisionSchema.safeParse({ decision: "SEND_BACK" }).success).toBe(false);
    expect(refundDecisionSchema.safeParse({ decision: "SEND_BACK", remarks: "x".repeat(1001) }).success).toBe(false);
  });

  it("labels where a refund stands (no review = still waiting, which is how every earlier refund starts)", () => {
    expect(refundStatusLabel(null)).toBe("Waiting for recommendation");
    expect(refundStatusLabel({ decision: null, decidedAt: null, decidedByName: null })).toBe("Waiting for recommendation");
    expect(refundStatusLabel({ decision: "RECOMMENDED", decidedAt: new Date("2026-11-24T10:00:00Z"), decidedByName: "A" })).toBe("Recommended on 24/11/2026");
    expect(refundStatusLabel({ decision: "SENT_BACK", decidedAt: new Date("2026-11-24T10:00:00Z"), decidedByName: "A" })).toBe("Sent back on 24/11/2026");
  });
});
