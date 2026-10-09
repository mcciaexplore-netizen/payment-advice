import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const where = vi.fn();
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  const insertValues = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({ values: insertValues }));
  return { where, from, select, insert, insertValues, getAdminSession: vi.fn() };
});

vi.mock("@/lib/db", () => ({ db: { select: mocks.select, insert: mocks.insert } }));
vi.mock("@/lib/admin-session", () => ({ getAdminSession: mocks.getAdminSession }));
vi.mock("@/lib/date-time", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/date-time")>()),
  todayInIst: () => "2026-09-11",
}));

import { GET } from "../app/api/cash-receipt/report/route";

const ISSUER = { adminUserId: "issuer-1", fullName: "Advika Mangrulkar", roles: ["SELF", "CASH_RECEIPT"], recommendingAuthorityId: null, branchScope: "SB Road Office" };
const FINANCE = { adminUserId: "finance-1", fullName: "Finance Person", roles: ["ALL"], recommendingAuthorityId: null };

const RECEIPTS = [
  { serialNo: "CR/SBR/2026-27/0002", receiptDate: "2026-09-11", partyName: "Ross Boilers", branch: "SB Road Office", total: "175.00", items: [{ particulars: "Sampada / Casual Sale", amount: "175.00" }] },
  { serialNo: "CR/SBR/2026-27/0001", receiptDate: "2026-09-11", partyName: "Forbes Marshall", branch: "SB Road Office", total: "1640.00", items: [{ particulars: "Sale of Directory - Defence Directory - Non-member", amount: "1500.00" }, { particulars: "Others (Specify): Form", amount: "140.00" }] },
];

function req(query = "") {
  return new NextRequest(`http://localhost/api/cash-receipt/report${query}`);
}

/** The WHERE the route sent to the DB, rendered to SQL + bound params. */
function sentWhere() {
  const condition = mocks.where.mock.calls[0][0] as SQL;
  return new PgDialect().sqlToQuery(condition);
}

describe("GET /api/cash-receipt/report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.where.mockResolvedValue(RECEIPTS);
  });

  it("an issuer downloads a real .xlsx of only their own receipts, and an audit entry is written", async () => {
    mocks.getAdminSession.mockResolvedValue(ISSUER);
    const response = await GET(req("?dateFrom=2026-09-11&dateTo=2026-09-11&depositDate=2026-09-15"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="CashReceipts_SB-Road-Office_2026-09-11_2026-09-11.xlsx"');

    const where = sentWhere();
    expect(where.sql).toContain('"cash_receipts"."issued_by_user_id" = $1');
    expect(where.params).toEqual(["issuer-1", "2026-09-11", "2026-09-11"]);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await response.arrayBuffer());
    const sheet = workbook.getWorksheet("Cash Receipts")!;
    expect(sheet.getCell("A1").value).toBe("Cash Collected Rs.1815/- at SB Road Office on 11-9-2026");
    expect(sheet.getCell("A4").value).toBe("CR/SBR/2026-27/0001");
    expect(sheet.getCell("L6").result).toBe(1815);

    expect(mocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({
      action: "CASH_RECEIPT_REPORT_DOWNLOADED",
      actor: "Advika Mangrulkar",
      details: expect.objectContaining({ from: "2026-09-11", to: "2026-09-11", depositDate: "2026-09-15", count: 2, total: "1815.00", scope: "issuer" }),
    }));
    // No entity FK on the audit row.
    const auditRow = mocks.insertValues.mock.calls[0][0] as Record<string, unknown>;
    expect(auditRow.cashReceiptId).toBeUndefined();
  });

  it("an issuer's tampered ?branch= is ignored: the query stays scoped to their own id", async () => {
    mocks.getAdminSession.mockResolvedValue(ISSUER);
    await GET(req("?branch=Tilak%20Road%20Office&issuedByUserId=someone-else&dateFrom=2026-09-01&dateTo=2026-09-30"));
    const where = sentWhere();
    expect(where.sql).not.toContain('"cash_receipts"."branch"');
    expect(where.params).toEqual(["issuer-1", "2026-09-01", "2026-09-30"]);
  });

  it("defaults the range to today (IST) when no dates are given", async () => {
    mocks.getAdminSession.mockResolvedValue(ISSUER);
    await GET(req());
    expect(sentWhere().params).toEqual(["issuer-1", "2026-09-11", "2026-09-11"]);
  });

  it("an empty range returns a 404 message, no file, and no audit entry", async () => {
    mocks.getAdminSession.mockResolvedValue(ISSUER);
    mocks.where.mockResolvedValue([]);
    const response = await GET(req("?dateFrom=2026-09-01&dateTo=2026-09-02"));
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect((await response.json()).error).toMatch(/No Cash Receipts in this date range/);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it.each([
    ["no session", null],
    ["a SELF-only session", { ...ISSUER, roles: ["SELF"] }],
    ["a BRANCH-only session", { ...ISSUER, roles: ["BRANCH"] }],
    ["an AUTHORITY session", { ...ISSUER, roles: ["AUTHORITY"] }],
  ])("%s gets 404 and never queries the database", async (_label, session) => {
    mocks.getAdminSession.mockResolvedValue(session);
    const response = await GET(req("?branch=SB%20Road%20Office"));
    expect(response.status).toBe(404);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it.each([
    ["?dateFrom=2026-02-30"],
    ["?dateFrom=2026-09-12&dateTo=2026-09-11"],
    ["?dateFrom=nonsense"],
    ["?depositDate=15-9-2026"],
  ])("rejects bad dates %s with 400 and no query", async (query) => {
    mocks.getAdminSession.mockResolvedValue(ISSUER);
    const response = await GET(req(query));
    expect(response.status).toBe(400);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("Finance with ?branch= gets that whole branch", async () => {
    mocks.getAdminSession.mockResolvedValue(FINANCE);
    const response = await GET(req("?branch=SB%20Road%20Office&dateFrom=2026-09-11&dateTo=2026-09-11"));
    expect(response.status).toBe(200);
    const where = sentWhere();
    expect(where.sql).toContain('"cash_receipts"."branch" = $1');
    expect(where.sql).not.toContain("issued_by_user_id");
    expect(where.params).toEqual(["SB Road Office", "2026-09-11", "2026-09-11"]);
    expect(mocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({ details: expect.objectContaining({ scope: "branch" }) }));
  });

  it("Finance must pick a real branch", async () => {
    mocks.getAdminSession.mockResolvedValue(FINANCE);
    expect((await GET(req())).status).toBe(400);
    expect((await GET(req("?branch=Mars%20Office"))).status).toBe(400);
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
