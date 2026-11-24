import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The refund PDF route: the Recommended stamp data is looked up only with the
 * recommendation process on (so the route never reads the reviews table before
 * migration 0032 is applied), and only a RECOMMENDED decision stamps. */
const state = vi.hoisted(() => ({
  refund: [] as unknown[],
  review: [] as unknown[],
  tables: [] as unknown[],
  rendered: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/pdf/render-refund-request", () => ({ renderRefundRequestPdf: async (data: Record<string, unknown>) => { state.rendered.push(data); return Buffer.from("%PDF-fake"); } }));
vi.mock("@/lib/db", async () => {
  const schema = await vi.importActual<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  return {
    db: {
      select: () => {
        const query: { table?: unknown } = {};
        const node: Record<string, unknown> = {};
        node.from = (table: unknown) => { query.table = table; state.tables.push(table); return node; };
        node.where = () => node;
        node.limit = () => Promise.resolve(query.table === schema.refundRequestReviews ? state.review : state.refund);
        return node;
      },
      insert: () => ({ values: async () => undefined }),
    },
  };
});

import { refundRequestReviews } from "@/lib/db/schema";
import { GET } from "../app/api/refund/[id]/pdf/route";

const ID = "71111111-1111-4111-8111-111111111111";
const ROW = { id: ID, serialNo: "REF/MCCIA/2026-27/0007", submittedByName: "Sandhya Acharya", documents: [] };
const open = () => GET(new NextRequest(`http://localhost/api/refund/${ID}/pdf`), { params: Promise.resolve({ id: ID }) });

beforeEach(() => {
  vi.stubEnv("REFUND_REQUESTS_ENABLED", "true");
  vi.stubEnv("REFUND_RECOMMENDATION_ENABLED", "true");
  state.refund = [ROW]; state.review = []; state.tables = []; state.rendered = [];
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/refund/[id]/pdf", () => {
  it("stamps Recommended by with the authority and date once recommended", async () => {
    const decidedAt = new Date("2026-11-24T10:00:00Z");
    state.review = [{ decision: "RECOMMENDED", decidedByName: "Aniruddha Brahma", decidedAt }];
    expect((await open()).status).toBe(200);
    expect(state.rendered[0]).toMatchObject({ recommendedBy: "Aniruddha Brahma", recommendedAt: decidedAt });
  });

  it("does not stamp a refund that is still waiting, or that was sent back", async () => {
    await open();
    expect(state.rendered[0]).toMatchObject({ recommendedBy: null, recommendedAt: null });
    state.review = [{ decision: "SENT_BACK", decidedByName: "Aniruddha Brahma", decidedAt: new Date() }];
    await open();
    expect(state.rendered[1]).toMatchObject({ recommendedBy: null, recommendedAt: null });
  });

  it("with the process off, never reads the reviews table (safe before the migration is applied)", async () => {
    vi.stubEnv("REFUND_RECOMMENDATION_ENABLED", "");
    state.review = [{ decision: "RECOMMENDED", decidedByName: "X", decidedAt: new Date() }];
    expect((await open()).status).toBe(200);
    expect(state.tables).not.toContain(refundRequestReviews);
    expect(state.rendered[0]).toMatchObject({ recommendedBy: null, recommendedAt: null });
  });
});
