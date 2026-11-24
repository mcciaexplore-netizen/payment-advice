import { NextRequest } from "next/server";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** An authority opens the supporting documents of a refund that names them,
 * and of no other: the file route is scoped by the signed-in authority's own
 * name, like the review page. */
const state = vi.hoisted(() => ({
  session: null as unknown,
  authorityRecord: [{ authorityName: "Aniruddha Brahma" }] as unknown[],
  refund: [] as unknown[],
  wheres: [] as unknown[],
  blob: null as unknown,
}));

vi.mock("@/lib/admin-session", () => ({ getAdminSession: async () => state.session }));
vi.mock("@vercel/blob", () => ({ get: async () => state.blob }));
vi.mock("@/lib/db", async () => {
  const schema = await vi.importActual<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  return {
    db: {
      select: () => {
        const query: { table?: unknown } = {};
        const node: Record<string, unknown> = {};
        node.from = (table: unknown) => { query.table = table; return node; };
        node.where = (where: unknown) => { if (query.table === schema.refundRequests) state.wheres.push(where); return node; };
        node.limit = () => Promise.resolve(query.table === schema.recommendingAuthorities ? state.authorityRecord : state.refund);
        return node;
      },
    },
  };
});

import { GET } from "../app/api/authority/refund/[id]/documents/[index]/route";

const ID = "71111111-1111-4111-8111-111111111111";
const AUTHORITY = { adminUserId: "u", fullName: "A", roles: ["AUTHORITY"], recommendingAuthorityId: "auth-1" };
const DOCUMENTS = [{ type: "CANCELLED_CHEQUE", fileName: "cheque.jpg", blobPathname: "refunds/cheque.jpg", blobUrl: "u", sizeBytes: 1 }];

const open = (id = ID, index = "0", query = "") => GET(new NextRequest(`http://localhost/api/authority/refund/${id}/documents/${index}${query}`), { params: Promise.resolve({ id, index }) });

beforeEach(() => {
  vi.stubEnv("REFUND_REQUESTS_ENABLED", "true");
  vi.stubEnv("REFUND_RECOMMENDATION_ENABLED", "true");
  state.session = AUTHORITY;
  state.refund = [{ documents: DOCUMENTS }];
  state.wheres = [];
  state.blob = { statusCode: 200, stream: new Blob(["file-bytes"]).stream() };
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/authority/refund/[id]/documents/[index]", () => {
  it("streams the document inline for the authority the refund names, never exposing a blob address", async () => {
    const response = await open();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("inline");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toBe("file-bytes");
  });

  it("downloads on request", async () => {
    state.blob = { statusCode: 200, stream: new Blob(["x"]).stream() };
    expect((await open(ID, "0", "?download=1")).headers.get("content-disposition")).toContain("attachment");
  });

  it("looks the refund up by the authority's own name from their account, with the id", async () => {
    await open();
    const where = new PgDialect().sqlToQuery(state.wheres[0] as SQL);
    expect(where.sql).toContain("regexp_replace(btrim(");
    expect(where.params).toEqual(expect.arrayContaining([ID, "Aniruddha Brahma"]));
  });

  it("is a 404 for a refund that does not name this authority", async () => {
    state.refund = [];
    expect((await open()).status).toBe(404);
  });

  it("is a 404 for anyone who is not an authority, a bad id, a bad or missing document, and while the process is off", async () => {
    state.session = { adminUserId: "u", fullName: "S", roles: ["SELF"], recommendingAuthorityId: null };
    expect((await open()).status).toBe(404);
    state.session = null;
    expect((await open()).status).toBe(404);
    state.session = AUTHORITY;
    expect((await open("nope")).status).toBe(404);
    expect((await open(ID, "5")).status).toBe(404);
    expect((await open(ID, "-1")).status).toBe(404);
    vi.stubEnv("REFUND_RECOMMENDATION_ENABLED", "");
    expect((await open()).status).toBe(404);
  });

  it("a storage failure is a 502, not a leak", async () => {
    state.blob = null;
    expect((await open()).status).toBe(502);
  });
});
