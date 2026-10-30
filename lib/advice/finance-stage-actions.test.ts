import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Fake db: select()...limit() -> queued row; tx.update().set().where().returning() -> queued result;
 * tx.execute() (NEFT FOR UPDATE read) -> queued rows; every insert recorded. */
const fake = vi.hoisted(() => {
  const state = { selectRow: [] as unknown[], returning: [] as unknown[][], execute: [] as unknown[], inserts: [] as Array<{ values: Record<string, unknown> }>, wheres: [] as unknown[] };
  const tx = {
    update: () => ({ set: () => ({ where: (where: unknown) => { state.wheres.push(where); return { returning: async () => state.returning.shift() ?? [], then: (r: (v: unknown) => unknown) => Promise.resolve(undefined).then(r) }; } }) }),
    insert: () => ({ values: async (values: Record<string, unknown>) => { state.inserts.push({ values }); } }),
    execute: async () => ({ rows: [state.execute.shift()] }),
  };
  const db = {
    select: () => { const node: Record<string, unknown> = {}; node.from = () => node; node.where = () => node; node.limit = async () => state.selectRow; return node; },
    transaction: async (cb: (t: typeof tx) => unknown) => cb(tx),
  };
  return { state, db, notifyVerified: vi.fn(), notifyPaymentDone: vi.fn(), notifyPaymentEntry: vi.fn() };
});
vi.mock("@/lib/db", () => ({ db: fake.db }));
vi.mock("@/lib/email/notify", () => ({ notifyVerified: fake.notifyVerified, notifyPaymentDone: fake.notifyPaymentDone, notifyPaymentEntry: fake.notifyPaymentEntry }));

import { markCashPaymentDone, receiveAdvice, recordNeftPayment, verifyAdvice } from "@/lib/advice/finance-stage-actions";

const ID = "11111111-1111-4111-8111-111111111111";
const base = { serialNo: "MCCIA/2026-27/0001", cashVoucherNo: null, isAdvance: false, advanceNo: null, submittedByName: "S", submittedByEmail: "s@x.co", payeeName: "P", amount: "1000.00", formDate: "2026-10-30", paymentMode: "NEFT" };
const sqlOf = (where: unknown) => new PgDialect().sqlToQuery(where as SQL).sql;

beforeEach(() => {
  Object.assign(fake.state, { selectRow: [], returning: [], execute: [], inserts: [], wheres: [] });
  for (const fn of [fake.notifyVerified, fake.notifyPaymentDone, fake.notifyPaymentEntry]) { fn.mockReset(); fn.mockResolvedValue(undefined); }
});

describe("no double processing: the losing click writes and emails nothing", () => {
  it("receive: the write requires finance_received_at IS NULL; nothing updated means 409 and no audit", async () => {
    fake.state.selectRow = [{ status: "SUBMITTED", authorityApprovedAt: new Date(), financeReceivedAt: null }];
    fake.state.returning = [[]];
    expect(await receiveAdvice(ID, "Abha", { ip: null })).toEqual({ ok: false, status: 409, error: "Already marked Received & In Process." });
    expect(sqlOf(fake.state.wheres[0])).toContain('"payment_advices"."finance_received_at" is null');
    expect(fake.state.inserts).toHaveLength(0);
  });

  it("verify: the write requires verified_at IS NULL; the loser sends no email", async () => {
    fake.state.selectRow = [{ ...base, financeReceivedAt: new Date(), verifiedAt: null }];
    fake.state.returning = [[]];
    expect((await verifyAdvice(ID, "Abha", { ip: null })).ok).toBe(false);
    expect(sqlOf(fake.state.wheres[0])).toContain('"payment_advices"."verified_at" is null');
    expect(fake.notifyVerified).not.toHaveBeenCalled();
  });

  it("cash payment done: the write requires payment_done_at IS NULL and status not APPROVED; the loser sends no email", async () => {
    fake.state.selectRow = [{ ...base, paymentMode: "CASH", status: "SUBMITTED", billPassedFor: "900.00", payableAmount: null, verifiedAt: new Date(), paymentDoneAt: null }];
    fake.state.returning = [[]];
    expect(await markCashPaymentDone(ID, "Abha", ["CASH_VOUCHER"], undefined, { ip: null })).toEqual({ ok: false, status: 409, error: "Already marked Payment Done." });
    const where = sqlOf(fake.state.wheres[0]);
    expect(where).toContain('"payment_advices"."payment_done_at" is null');
    expect(where).toContain('"payment_advices"."status" <> $');
    expect(fake.notifyPaymentDone).not.toHaveBeenCalled();
  });

  it("NEFT payment: if another payment was recorded since the user loaded the row (bulk), nothing is recorded or emailed", async () => {
    fake.state.selectRow = [{ ...base, verifiedAt: new Date() }];
    fake.state.execute = [{ payable_amount: "1000.00", total_paid: "400.00", status: "SUBMITTED" }];
    const result = await recordNeftPayment(ID, "Abha", ["PAYMENT_ADVICE"], { amount: 600 }, { ip: null, expectedTotalPaid: "0.00" });
    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(fake.state.inserts).toHaveLength(0);
    expect(fake.notifyPaymentEntry).not.toHaveBeenCalled();
  });
});

describe("a stage change stands even when its email fails", () => {
  it("verify: the update and audit are committed before the email, and an email failure (logged inside send(), never thrown) leaves the result ok", async () => {
    fake.state.selectRow = [{ ...base, financeReceivedAt: new Date(), verifiedAt: null }];
    fake.state.returning = [[{ id: ID }]];
    fake.notifyVerified.mockResolvedValue(undefined);
    const result = await verifyAdvice(ID, "Abha", { ip: "1.2.3.4", extra: { bulk: true, batchId: "b" } });
    expect(result.ok).toBe(true);
    expect(fake.state.inserts[0].values).toMatchObject({ action: "VERIFIED", actor: "Abha", details: { verifiedBy: "Abha", bulk: true, batchId: "b" } });
    expect(fake.notifyVerified).toHaveBeenCalledTimes(1);
  });

  it("NEFT partial payment: entry + audit (tagged bulk) then one email; the final one settles", async () => {
    fake.state.selectRow = [{ ...base, verifiedAt: new Date() }];
    fake.state.execute = [{ payable_amount: "1000.00", total_paid: "0", status: "SUBMITTED" }];
    const partial = await recordNeftPayment(ID, "Abha", ["ALL"], { amount: 400, remarks: "UTR / Ref: U1" }, { ip: null, extra: { bulk: true }, expectedTotalPaid: "0.00" });
    expect(partial).toMatchObject({ ok: true, data: { isFinal: false, totalPaid: "400.00", remaining: "600.00" } });
    expect(fake.state.inserts.map((i) => i.values.action ?? "entry")).toEqual(["entry", "PAYMENT_ENTRY_RECORDED"]);
    expect(fake.state.inserts[1].values.details).toMatchObject({ bulk: true, isFinal: false, remarks: "UTR / Ref: U1" });
    expect(fake.notifyPaymentEntry).toHaveBeenCalledTimes(1);
  });
});

describe("role rules and the named receiver (2026-10-30)", () => {
  it("Cash Payment Done: only CASH_VOUCHER or ALL; PAYMENT_ADVICE gets 403 before anything is written or emailed", async () => {
    const cashRow = { ...base, paymentMode: "CASH", status: "SUBMITTED", billPassedFor: "900.00", payableAmount: null, verifiedAt: new Date(), paymentDoneAt: null };
    fake.state.selectRow = [cashRow];
    expect(await markCashPaymentDone(ID, "Sunil", ["PAYMENT_ADVICE"], undefined, { ip: null })).toEqual({ ok: false, status: 403, error: "Only a Cash Voucher account (or an All-Access account) can mark this Payment Done." });
    expect(fake.state.wheres).toHaveLength(0);
    expect(fake.notifyPaymentDone).not.toHaveBeenCalled();
    for (const roles of [["CASH_VOUCHER"], ["ALL"]] as const) {
      fake.state.selectRow = [cashRow];
      fake.state.returning = [[{ id: ID }]];
      expect((await markCashPaymentDone(ID, "Abha", [...roles], undefined, { ip: null })).ok).toBe(true);
    }
  });

  it("NEFT Record a Payment: only PAYMENT_ADVICE or ALL; CASH_VOUCHER gets 403 and nothing is recorded", async () => {
    fake.state.selectRow = [{ ...base, verifiedAt: new Date() }];
    expect(await recordNeftPayment(ID, "Abha", ["CASH_VOUCHER"], { amount: 100 }, { ip: null })).toEqual({ ok: false, status: 403, error: "Only a Payment Advice account (or an All-Access account) can record a payment." });
    expect(fake.state.inserts).toHaveLength(0);
    expect(fake.notifyPaymentEntry).not.toHaveBeenCalled();
  });

  it("Mark received records the named Finance user, not ADMIN", async () => {
    fake.state.selectRow = [{ status: "SUBMITTED", authorityApprovedAt: new Date(), financeReceivedAt: null }];
    fake.state.returning = [[{ id: ID }]];
    expect((await receiveAdvice(ID, "Abha Khatavkar", { ip: null })).ok).toBe(true);
    expect(fake.state.inserts[0].values).toMatchObject({ action: "FINANCE_RECEIVED", actor: "Abha Khatavkar", details: { receivedBy: "Abha Khatavkar" } });
  });
});
