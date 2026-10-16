import { NextRequest } from "next/server";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = { lastNumber: 0, insertError: null as Error | null, inserts: [] as Array<{ table: unknown; values: Record<string, unknown> }>, executed: [] as SQL[] };
  const tx = {
    execute: vi.fn(async (query: SQL) => {
      state.executed.push(query);
      return { rows: [{ last_number: state.lastNumber }] };
    }),
    insert: vi.fn((table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        const node = {
          returning: async () => {
            if (state.insertError) throw state.insertError;
            state.inserts.push({ table, values });
            return [{ id: "99999999-9999-4999-8999-999999999999", serialNo: values.serialNo }];
          },
          then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
            state.inserts.push({ table, values });
            return Promise.resolve(undefined).then(resolve, reject);
          },
        };
        return node;
      },
    })),
  };
  const transaction = vi.fn(async (callback: (t: typeof tx) => unknown) => callback(tx));
  return { state, tx, transaction, verify: vi.fn(async () => null) };
});

vi.mock("@/lib/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/lib/attachments/verify-uploaded", () => ({ verifyUploadedAttachments: mocks.verify }));
vi.mock("@/lib/date-time", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/date-time")>()),
  todayInIst: () => "2026-10-16",
}));

import { POST } from "@/app/api/refund/submit/route";
import { auditLog, refundRequests } from "@/lib/db/schema";

function form(overrides: Record<string, string> = {}) {
  const body = new FormData();
  const fields: Record<string, string> = {
    submittedByName: "Test Submitter", submittedByEmail: "submitter@example.com", submittedByDepartment: "ADMIN",
    branch: "Tilak Road Office", recommendingAuthority: "Head Admin", payeeName: "Pune Expo Services",
    basicAmount: "1000.10", gstAmount: "180.20", natureOfExpenditure: "Refund of stall booking", fromDate: "2026-10-01",
    documents: "[]", ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  return new NextRequest("http://localhost/api/refund/submit", { method: "POST", body, headers: { "x-forwarded-for": "203.0.113.9" } });
}

describe("POST /api/refund/submit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.lastNumber = 0;
    mocks.state.insertError = null;
    mocks.state.inserts = [];
    mocks.state.executed = [];
  });
  afterEach(() => vi.unstubAllEnvs());

  it("production with the flag off: 404 and no database access", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REFUND_REQUESTS_ENABLED", "");
    const response = await POST(form());
    expect(response.status).toBe(404);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("local development with the flag off: validates, answers previewOnly, never touches the database or Blob", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("REFUND_REQUESTS_ENABLED", "");
    const response = await POST(form());
    expect(await response.json()).toEqual({ previewOnly: true, serialNo: "LOCAL PREVIEW ONLY" });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it("rejects invalid input with 400 before any database work", async () => {
    vi.stubEnv("REFUND_REQUESTS_ENABLED", "true");
    const response = await POST(form({ payeeName: "   " }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Payee / Company Name is required");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("flag on: allocates REF/MCCIA/<FY>/NNNN on the REFUND series with FOR UPDATE, inserts the row and the audit entry in one transaction", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REFUND_REQUESTS_ENABLED", "true");
    mocks.state.lastNumber = 6;
    const response = await POST(form());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ previewOnly: false, id: "99999999-9999-4999-8999-999999999999", serialNo: "REF/MCCIA/2026-27/0007" });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);

    const queries = mocks.state.executed.map((query) => new PgDialect().sqlToQuery(query));
    expect(queries.some((query) => query.sql.includes("for update") && query.params.includes("REFUND"))).toBe(true);

    const [refund, audit] = mocks.state.inserts;
    expect(refund.table).toBe(refundRequests);
    expect(refund.values).toMatchObject({
      serialNo: "REF/MCCIA/2026-27/0007", financialYear: "2026-27", requestDate: "2026-10-16", payeeName: "Pune Expo Services",
      basicAmount: "1000.10", gstAmount: "180.20", totalAmount: "1180.30", payeeAddress: null, bankIfsc: null, documents: [],
    });
    expect(audit.table).toBe(auditLog);
    expect(audit.values).toMatchObject({ refundRequestId: "99999999-9999-4999-8999-999999999999", action: "REFUND_REQUEST_SUBMITTED", actor: "Test Submitter", ipAddress: "203.0.113.9" });
  });

  it("a client-supplied date or serial is ignored", async () => {
    vi.stubEnv("REFUND_REQUESTS_ENABLED", "true");
    await POST(form({ requestDate: "2020-01-01", serialNo: "REF/MCCIA/2020-21/9999" }));
    expect(mocks.state.inserts[0].values).toMatchObject({ requestDate: "2026-10-16", serialNo: "REF/MCCIA/2026-27/0001" });
  });

  it("a failed insert returns 503 and writes no audit entry (the transaction, and so the counter, rolls back)", async () => {
    vi.stubEnv("REFUND_REQUESTS_ENABLED", "true");
    mocks.state.insertError = new Error('relation "refund_requests" does not exist');
    const response = await POST(form());
    expect(response.status).toBe(503);
    await expect(mocks.transaction.mock.results[0].value).rejects.toThrow("refund_requests");
    expect(mocks.state.inserts).toHaveLength(0);
  });

  it("rejects documents that fail the upload check", async () => {
    vi.stubEnv("REFUND_REQUESTS_ENABLED", "true");
    mocks.verify.mockResolvedValueOnce("Upload not found" as never);
    const documents = JSON.stringify([{ type: "EMAIL_COPY", fileName: "a.pdf", blobPathname: "pending-uploads/x/a.pdf", blobUrl: "https://example.com/a", sizeBytes: 10 }]);
    const response = await POST(form({ documents }));
    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
