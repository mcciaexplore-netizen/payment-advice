import { NextRequest } from "next/server";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRefundWhere, parseRefundFilterParams } from "@/lib/advice/refund-query";

const mocks = vi.hoisted(() => ({ rows: [] as unknown[], session: null as unknown, blobGet: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: () => { const node: Record<string, unknown> = {}; for (const m of ["from", "where"]) node[m] = () => node; node.limit = async () => mocks.rows; return node; } } }));
vi.mock("@/lib/admin-session", () => ({ getAdminSession: async () => mocks.session }));
vi.mock("@vercel/blob", () => ({ get: mocks.blobGet }));

import { GET } from "@/app/api/admin/refund/[id]/documents/[index]/route";

const ID = "99999999-9999-4999-8999-999999999999";
const ROW = { documents: [
  { type: "EMAIL_COPY", fileName: "cancellation mail.pdf", blobPathname: "pending-uploads/a/mail.pdf", blobUrl: "https://secret.blob/a", sizeBytes: 10 },
  { type: "CANCELLED_CHEQUE", fileName: "cheque.jpg", blobPathname: "pending-uploads/a/cheque.jpg", blobUrl: "https://secret.blob/b", sizeBytes: 10 },
] };
const FINANCE = { adminUserId: "f", fullName: "Finance", roles: ["ALL"], recommendingAuthorityId: null };
const call = (index: string, query = "", id = ID) => GET(new NextRequest(`http://localhost/api/admin/refund/${id}/documents/${index}${query}`), { params: Promise.resolve({ id, index }) });

describe("GET /api/admin/refund/[id]/documents/[index]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rows = [ROW];
    mocks.blobGet.mockResolvedValue({ statusCode: 200, stream: new ReadableStream({ start(c) { c.enqueue(new Uint8Array([0xff, 0xd8, 0xff])); c.close(); } }) });
  });

  it("Finance gets the file streamed from private Blob, inline, with nosniff and the original name", async () => {
    mocks.session = FINANCE;
    const response = await call("1");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("content-disposition")).toMatch(/^inline; filename="cheque.jpg"/);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(mocks.blobGet).toHaveBeenCalledWith("pending-uploads/a/cheque.jpg", { access: "private" });
  });

  it("?download=1 saves it as an attachment", async () => {
    mocks.session = FINANCE;
    expect((await call("0", "?download=1")).headers.get("content-disposition")).toMatch(/^attachment; filename="cancellation mail.pdf"/);
  });

  it.each([
    ["no session", null],
    ["a branch member", { ...FINANCE, roles: ["BRANCH"] }],
    ["a Cash Receipt issuer", { ...FINANCE, roles: ["CASH_RECEIPT"] }],
    ["an authority", { ...FINANCE, roles: ["AUTHORITY"] }],
  ])("%s gets 404 and nothing is fetched", async (_label, session) => {
    mocks.session = session;
    expect((await call("0")).status).toBe(404);
    expect(mocks.blobGet).not.toHaveBeenCalled();
  });

  it("bad ids, out-of-range and non-numeric indexes are 404", async () => {
    mocks.session = FINANCE;
    expect((await call("5")).status).toBe(404);
    expect((await call("-1")).status).toBe(404);
    expect((await call("1.5")).status).toBe(404);
    expect((await call("0", "", "not-a-uuid")).status).toBe(404);
    mocks.rows = [];
    expect((await call("0")).status).toBe(404);
    expect(mocks.blobGet).not.toHaveBeenCalled();
  });
});

describe("refund list filters", () => {
  it("accepts a known branch and ISO dates, and ignores anything else", () => {
    expect(parseRefundFilterParams(new URLSearchParams({ branch: "SB Road Office", dateFrom: "2026-10-01", dateTo: "2026-10-16" }))).toEqual({ branch: "SB Road Office", dateFrom: "2026-10-01", dateTo: "2026-10-16" });
    expect(parseRefundFilterParams(new URLSearchParams({ branch: "Mars", dateFrom: "16/10/2026" }))).toEqual({ branch: undefined, dateFrom: undefined, dateTo: undefined });
  });

  it("builds the WHERE from the filters only", () => {
    const query = new PgDialect().sqlToQuery(buildRefundWhere({ branch: "SB Road Office", dateFrom: "2026-10-01" })!);
    expect(query.params).toEqual(["SB Road Office", "2026-10-01"]);
    expect(buildRefundWhere({})).toBeUndefined();
  });
});
