import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const limit = vi.fn();
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  const insertValues = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({ values: insertValues }));
  return { limit, where, from, select, insert, insertValues, getAdminSession: vi.fn() };
});

vi.mock("@/lib/db", () => ({ db: { select: mocks.select, insert: mocks.insert } }));
vi.mock("@/lib/admin-session", () => ({ getAdminSession: mocks.getAdminSession }));
vi.mock("@/lib/pdf/render-cash-receipt", () => ({ renderCashReceiptPdf: vi.fn().mockResolvedValue(Buffer.from("fake-pdf-bytes")) }));
vi.stubEnv("NODE_ENV", "production");

import { GET } from "../../app/api/cash-receipt/[id]/pdf/route";

const RECEIPT = {
  id: "11111111-1111-4111-8111-111111111111",
  serialNo: "CR/AHN/2026-27/0001",
  branch: "Ahilyanagar Office",
  receiptDate: "2026-10-06",
  partyName: "Test Party",
  gstin: null,
  items: [{ particulars: "Sale of Directory", copies: 1, price: "500.00", amount: "500.00" }],
  total: "500.00",
  issuedByUserId: "issuer-1",
  submittedByName: "Ravindra Pansare",
};

function req() {
  return new NextRequest(`http://localhost/api/cash-receipt/${RECEIPT.id}/pdf`);
}

describe("GET /api/cash-receipt/[id]/pdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.limit.mockResolvedValue([RECEIPT]);
  });

  it("the issuer can download their own receipt — 200, PDF content type, audit entry written", async () => {
    mocks.getAdminSession.mockResolvedValue({ adminUserId: "issuer-1", fullName: "Ravindra Pansare", roles: ["CASH_RECEIPT"], recommendingAuthorityId: null, branchScope: "Ahilyanagar Office" });
    const response = await GET(req(), { params: Promise.resolve({ id: RECEIPT.id }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(mocks.insert).toHaveBeenCalled();
    expect(mocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({
      cashReceiptId: RECEIPT.id,
      action: "CASH_RECEIPT_PDF_GENERATED",
    }));
  });

  it("a different CASH_RECEIPT account — even the same branch — gets 404, not the PDF, and no audit entry", async () => {
    mocks.getAdminSession.mockResolvedValue({ adminUserId: "colleague-2", fullName: "Someone Else", roles: ["CASH_RECEIPT"], recommendingAuthorityId: null, branchScope: "Ahilyanagar Office" });
    const response = await GET(req(), { params: Promise.resolve({ id: RECEIPT.id }) });
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).not.toMatch(/application\/pdf/);
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("a BRANCH-only session gets 404 even for the receipt they issued (2026-10-07: BRANCH alone no longer grants Cash Receipt access)", async () => {
    mocks.getAdminSession.mockResolvedValue({ adminUserId: "issuer-1", fullName: "Ravindra Pansare", roles: ["BRANCH"], recommendingAuthorityId: null, branchScope: "Ahilyanagar Office" });
    const response = await GET(req(), { params: Promise.resolve({ id: RECEIPT.id }) });
    expect(response.status).toBe(404);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("an unauthenticated request gets 404, not the PDF", async () => {
    mocks.getAdminSession.mockResolvedValue(null);
    const response = await GET(req(), { params: Promise.resolve({ id: RECEIPT.id }) });
    expect(response.status).toBe(404);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("any Finance session (not just BRANCH) can download any receipt", async () => {
    mocks.getAdminSession.mockResolvedValue({ adminUserId: "finance-1", fullName: "Finance Admin", roles: ["ALL"], recommendingAuthorityId: null });
    const response = await GET(req(), { params: Promise.resolve({ id: RECEIPT.id }) });
    expect(response.status).toBe(200);
  });

  it("a nonexistent receipt id is 404 regardless of session", async () => {
    mocks.limit.mockResolvedValue([]);
    mocks.getAdminSession.mockResolvedValue({ adminUserId: "issuer-1", fullName: "Ravindra Pansare", roles: ["CASH_RECEIPT"], recommendingAuthorityId: null, branchScope: "Ahilyanagar Office" });
    const response = await GET(req(), { params: Promise.resolve({ id: "does-not-exist" }) });
    expect(response.status).toBe(404);
  });
});
