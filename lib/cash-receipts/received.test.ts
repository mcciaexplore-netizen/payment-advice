import { NextRequest } from "next/server";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Scripted fake of the db: each update().returning() and select() takes the
 * next queued result, and every call is recorded (with its WHERE rendered
 * to SQL) so tests can check what would be sent to Postgres. */
const fake = vi.hoisted(() => {
  const state = {
    updateResults: [] as unknown[][],
    selectResults: [] as unknown[][],
    updates: [] as Array<{ set: Record<string, unknown>; where?: unknown }>,
    inserts: [] as Array<Record<string, unknown>>,
    session: null as unknown,
    notify: vi.fn(async () => "sent" as string),
  };
  const update = () => {
    const call: { set: Record<string, unknown>; where?: unknown } = { set: {} };
    state.updates.push(call);
    const node: Record<string, unknown> = {};
    node.set = (values: Record<string, unknown>) => { call.set = values; return node; };
    node.where = (where: unknown) => { call.where = where; return node; };
    node.returning = async () => state.updateResults.shift() ?? [];
    node.then = (resolve: (value: unknown) => unknown) => Promise.resolve(undefined).then(resolve);
    return node;
  };
  const select = () => {
    const node: Record<string, unknown> = {};
    for (const m of ["from", "where", "limit", "for"]) node[m] = () => node;
    node.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(state.selectResults.shift() ?? []).then(resolve, reject);
    return node;
  };
  const insert = () => ({ values: async (values: Record<string, unknown>) => { state.inserts.push(values); } });
  const db = { update, select, insert, transaction: async (cb: (tx: unknown) => unknown) => cb({ update, select, insert }) };
  return { state, db };
});

vi.mock("@/lib/db", () => ({ db: fake.db }));
vi.mock("@/lib/admin-session", () => ({ getAdminSession: async () => fake.state.session }));
vi.mock("@/lib/email/notify", () => ({ notifyCashReceiptReceived: fake.state.notify }));

import { POST as markRoute } from "@/app/api/admin/cash-receipts/received/route";
import { POST as resendRoute } from "@/app/api/admin/cash-receipts/[id]/received/resend-email/route";
import { POST as undoRoute } from "@/app/api/admin/cash-receipts/[id]/received/undo/route";
import { cashReceiptStatusText } from "@/lib/cash-receipts/status";

const sqlOf = (where: unknown) => new PgDialect().sqlToQuery(where as SQL);
const ID = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
const session = (roles: string[], fullName = "Abha Khatavkar") => ({ adminUserId: "u1", fullName, roles, recommendingAuthorityId: null });
const receipt = (i: number, extra: Record<string, unknown> = {}) => ({
  id: ID[i], serialNo: `CR/SBR/2026-27/000${i + 1}`, partyName: `Party ${i + 1}`, total: "500.00", receiptDate: "2026-10-30",
  submittedByName: "Advika Mangrulkar", submittedByEmail: "advikam@mcciapune.com", issuedByUserId: "issuer-1",
  receivedAt: new Date("2026-10-30T10:00:00Z"), receivedBy: "Abha Khatavkar", receivedNote: null, ...extra,
});
const markReq = (body: unknown) => new NextRequest("http://localhost/api/admin/cash-receipts/received", { method: "POST", body: JSON.stringify(body), headers: { "x-forwarded-for": "203.0.113.5" } });
const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  fake.state.updateResults = [];
  fake.state.selectResults = [];
  fake.state.updates = [];
  fake.state.inserts = [];
  fake.state.notify.mockReset();
  fake.state.notify.mockResolvedValue("sent");
});

describe("who can mark Cash Receipts as received", () => {
  it.each([["ALL"], ["CASH_VOUCHER"]])("%s can mark", async (role) => {
    fake.state.session = session([role]);
    fake.state.updateResults = [[receipt(0)]];
    expect((await markRoute(markReq({ ids: [ID[0]] }))).status).toBe(200);
  });

  it.each([["PAYMENT_ADVICE"], ["BRANCH"], ["DEPARTMENT"], ["SELF"], ["CASH_RECEIPT"], ["AUTHORITY"]])("%s gets 403 and nothing is written or sent", async (role) => {
    fake.state.session = session([role]);
    const response = await markRoute(markReq({ ids: [ID[0]] }));
    expect(response.status).toBe(403);
    expect(fake.state.updates).toHaveLength(0);
    expect(fake.state.notify).not.toHaveBeenCalled();
  });

  it("no session gets 401", async () => {
    fake.state.session = null;
    expect((await markRoute(markReq({ ids: [ID[0]] }))).status).toBe(401);
  });
});

describe("marking", () => {
  it("uses server time and the session user; any time or user sent by the browser is ignored", async () => {
    fake.state.session = session(["CASH_VOUCHER"]);
    fake.state.updateResults = [[receipt(0)]];
    const before = Date.now();
    await markRoute(markReq({ ids: [ID[0]], note: " short by 50 ", receivedAt: "2020-01-01T00:00:00Z", receivedBy: "Someone Else", actor: "x" }));
    const set = fake.state.updates[0].set;
    expect(set.receivedBy).toBe("Abha Khatavkar");
    expect((set.receivedAt as Date).getTime()).toBeGreaterThanOrEqual(before);
    expect(set.receivedNote).toBe("short by 50");
    expect(Object.keys(set).sort()).toEqual(["receivedAt", "receivedBy", "receivedNote"]);
  });

  it("only updates rows still pending (received_at IS NULL), and writes CASH_RECEIPT_RECEIVED per receipt", async () => {
    fake.state.session = session(["ALL"], "Finance Head");
    fake.state.updateResults = [[receipt(0)]];
    await markRoute(markReq({ ids: [ID[0]] }));
    const where = sqlOf(fake.state.updates[0].where);
    expect(where.sql).toContain('"cash_receipts"."received_at" is null');
    expect(where.params).toContain(ID[0]);
    expect(fake.state.inserts).toEqual([expect.objectContaining({ cashReceiptId: ID[0], action: "CASH_RECEIPT_RECEIVED", actor: "Finance Head", ipAddress: "203.0.113.5" })]);
  });

  it("a double click marks once and sends one email: the second request finds nothing pending", async () => {
    fake.state.session = session(["CASH_VOUCHER"]);
    fake.state.updateResults = [[receipt(0)], []];
    fake.state.selectResults = [[{ id: ID[0], serialNo: "CR/SBR/2026-27/0001", receivedAt: new Date() }]];
    const first = await (await markRoute(markReq({ ids: [ID[0]] }))).json();
    const second = await (await markRoute(markReq({ ids: [ID[0]] }))).json();
    expect(first.marked).toHaveLength(1);
    expect(second.marked).toHaveLength(0);
    expect(second.alreadyReceived).toEqual(["CR/SBR/2026-27/0001"]);
    expect(fake.state.notify).toHaveBeenCalledTimes(1);
    expect(fake.state.inserts.filter((row) => row.action === "CASH_RECEIPT_RECEIVED")).toHaveLength(1);
  });

  it("bulk: one transaction marks every selected receipt, one audit row and one email each", async () => {
    fake.state.session = session(["CASH_VOUCHER"]);
    fake.state.updateResults = [[receipt(0), receipt(1), receipt(2)]];
    const body = await (await markRoute(markReq({ ids: [ID[0], ID[1], ID[2], ID[0]] }))).json();
    expect(sqlOf(fake.state.updates[0].where).params.slice(0, 3)).toEqual([ID[0], ID[1], ID[2]]);
    expect(body.marked.map((m: { serialNo: string }) => m.serialNo)).toEqual(["CR/SBR/2026-27/0001", "CR/SBR/2026-27/0002", "CR/SBR/2026-27/0003"]);
    expect(fake.state.inserts).toHaveLength(3);
    expect(fake.state.notify).toHaveBeenCalledTimes(3);
  });

  it("emails the issuer with receipt no., party, amount, receipt date, received on/by and note", async () => {
    fake.state.session = session(["CASH_VOUCHER"]);
    fake.state.updateResults = [[receipt(0, { receivedNote: "short by 50" })]];
    await markRoute(markReq({ ids: [ID[0]], note: "short by 50" }));
    expect(fake.state.notify).toHaveBeenCalledWith(expect.objectContaining({
      serialNo: "CR/SBR/2026-27/0001", issuerName: "Advika Mangrulkar", partyName: "Party 1", amount: "500.00", receiptDate: "2026-10-30", receivedBy: "Abha Khatavkar", note: "short by 50",
    }), "advikam@mcciapune.com", ID[0]);
  });

  it("records received_email_sent_at only after a real send, guarded by IS NULL", async () => {
    fake.state.session = session(["CASH_VOUCHER"]);
    fake.state.updateResults = [[receipt(0)]];
    await markRoute(markReq({ ids: [ID[0]] }));
    const sentUpdate = fake.state.updates[1];
    expect(Object.keys(sentUpdate.set)).toEqual(["receivedEmailSentAt"]);
    expect(sqlOf(sentUpdate.where).sql).toContain('"cash_receipts"."received_email_sent_at" is null');
  });

  it("a failed email does not undo the marking: no revert, no sent time, the row reports the failure", async () => {
    fake.state.session = session(["CASH_VOUCHER"]);
    fake.state.updateResults = [[receipt(0)]];
    fake.state.notify.mockResolvedValue("failed");
    const response = await markRoute(markReq({ ids: [ID[0]] }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.marked).toEqual([expect.objectContaining({ serialNo: "CR/SBR/2026-27/0001", email: "failed" })]);
    expect(fake.state.updates).toHaveLength(1);
    expect(fake.state.inserts).toEqual([expect.objectContaining({ action: "CASH_RECEIPT_RECEIVED" })]);
  });

  it.each([[{ ids: [] }], [{ ids: ["not-a-uuid"] }], [{ ids: [ID[0]], note: "x".repeat(201) }], [null]])("rejects a bad body %o with 400 before writing", async (body) => {
    fake.state.session = session(["ALL"]);
    expect((await markRoute(markReq(body))).status).toBe(400);
    expect(fake.state.updates).toHaveLength(0);
  });
});

describe("resend email", () => {
  it("claims the send (received, not yet emailed) so two clicks cannot send twice, and keeps it on success", async () => {
    fake.state.session = session(["CASH_VOUCHER"]);
    fake.state.updateResults = [[receipt(0)], []];
    expect((await resendRoute(new Request("http://x"), idParams(ID[0]))).status).toBe(200);
    expect((await resendRoute(new Request("http://x"), idParams(ID[0]))).status).toBe(409);
    const claim = sqlOf(fake.state.updates[0].where).sql;
    expect(claim).toContain('"cash_receipts"."received_at" is not null');
    expect(claim).toContain('"cash_receipts"."received_email_sent_at" is null');
    expect(fake.state.notify).toHaveBeenCalledTimes(1);
  });

  it("releases the claim when the send fails, so Resend stays available", async () => {
    fake.state.session = session(["ALL"]);
    fake.state.updateResults = [[receipt(0)]];
    fake.state.notify.mockResolvedValue("failed");
    expect((await resendRoute(new Request("http://x"), idParams(ID[0]))).status).toBe(502);
    expect(fake.state.updates[1].set).toEqual({ receivedEmailSentAt: null });
  });

  it("is limited to ALL and CASH_VOUCHER", async () => {
    fake.state.session = session(["PAYMENT_ADVICE"]);
    expect((await resendRoute(new Request("http://x"), idParams(ID[0]))).status).toBe(403);
  });
});

describe("undo", () => {
  const undoReq = (body: unknown) => new NextRequest("http://localhost/x", { method: "POST", body: JSON.stringify(body) });

  it("ALL can undo with a reason: fields cleared and CASH_RECEIPT_RECEIVED_UNDONE logged with what was undone", async () => {
    fake.state.session = session(["ALL"], "Finance Head");
    fake.state.selectResults = [[receipt(0, { receivedNote: "short by 50" })]];
    const response = await undoRoute(undoReq({ reason: "Marked the wrong receipt" }), idParams(ID[0]));
    expect(response.status).toBe(200);
    expect(fake.state.updates[0].set).toEqual({ receivedAt: null, receivedBy: null, receivedNote: null, receivedEmailSentAt: null });
    expect(fake.state.inserts).toEqual([expect.objectContaining({
      cashReceiptId: ID[0], action: "CASH_RECEIPT_RECEIVED_UNDONE", actor: "Finance Head",
      details: expect.objectContaining({ reason: "Marked the wrong receipt", previousReceivedBy: "Abha Khatavkar", previousNote: "short by 50" }),
    })]);
  });

  it("CASH_VOUCHER cannot undo (403), and a reason is required (400)", async () => {
    fake.state.session = session(["CASH_VOUCHER"]);
    expect((await undoRoute(undoReq({ reason: "Wrong one" }), idParams(ID[0]))).status).toBe(403);
    fake.state.session = session(["ALL"]);
    expect((await undoRoute(undoReq({ reason: "  " }), idParams(ID[0]))).status).toBe(400);
    expect((await undoRoute(undoReq({}), idParams(ID[0]))).status).toBe(400);
    expect(fake.state.updates).toHaveLength(0);
  });

  it("a receipt that is not received cannot be undone (409)", async () => {
    fake.state.session = session(["ALL"]);
    fake.state.selectResults = [[receipt(0, { receivedAt: null, receivedBy: null })]];
    expect((await undoRoute(undoReq({ reason: "Testing" }), idParams(ID[0]))).status).toBe(409);
    expect(fake.state.inserts).toHaveLength(0);
  });
});

describe("status wording", () => {
  it("is Pending or Received on <date> by <name>", () => {
    expect(cashReceiptStatusText({ receivedAt: null, receivedBy: null })).toBe("Pending");
    expect(cashReceiptStatusText({ receivedAt: "2026-10-30T10:00:00Z", receivedBy: "Abha Khatavkar" })).toBe("Received on 30/10/2026 by Abha Khatavkar");
  });
});
