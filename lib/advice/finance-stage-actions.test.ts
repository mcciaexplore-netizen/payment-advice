import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Fake db: select()...limit() -> queued row; tx.update().set().where().returning() -> queued result;
 * tx.execute() (NEFT FOR UPDATE read) -> queued rows; every insert recorded. */
const fake = vi.hoisted(() => {
  const state = {
    selectRow: [] as unknown[], returning: [] as unknown[][], execute: [] as unknown[], inserts: [] as Array<{ values: Record<string, unknown> }>, wheres: [] as unknown[],
    // Committed update sets, in order; `failInsert` makes a matching insert throw.
    updates: [] as Array<Record<string, unknown>>, failInsert: null as null | ((values: Record<string, unknown>) => boolean),
  };
  const tx = {
    update: () => ({ set: (values: Record<string, unknown>) => { state.updates.push(values); return { where: (where: unknown) => { state.wheres.push(where); return { returning: async () => state.returning.shift() ?? [], then: (r: (v: unknown) => unknown) => Promise.resolve(undefined).then(r) }; } }; } }),
    insert: () => ({ values: async (values: Record<string, unknown>) => { if (state.failInsert?.(values)) throw new Error("insert failed"); state.inserts.push({ values }); } }),
    execute: async () => ({ rows: [state.execute.shift()] }),
  };
  const db = {
    select: () => { const node: Record<string, unknown> = {}; node.from = () => node; node.where = () => node; node.limit = async () => state.selectRow; return node; },
    // Like Postgres: a throw inside the callback rolls back every write it made.
    transaction: async (cb: (t: typeof tx) => unknown) => {
      const mark = { inserts: state.inserts.length, updates: state.updates.length };
      try { return await cb(tx); } catch (error) { state.inserts.length = mark.inserts; state.updates.length = mark.updates; throw error; }
    },
  };
  return { state, db, notifyVerified: vi.fn(), notifyPaymentDone: vi.fn(), notifyPaymentEntry: vi.fn() };
});
vi.mock("@/lib/db", () => ({ db: fake.db }));
vi.mock("@/lib/email/notify", () => ({ notifyVerified: fake.notifyVerified, notifyPaymentDone: fake.notifyPaymentDone, notifyPaymentEntry: fake.notifyPaymentEntry }));

import { BULK_BASIC_PAYABLE_NOTE, markCashPaymentDone, receiveAdvice, recordNeftPayment, verifyAdvice } from "@/lib/advice/finance-stage-actions";

const ID = "11111111-1111-4111-8111-111111111111";
const base = { serialNo: "MCCIA/2026-27/0001", cashVoucherNo: null, isAdvance: false, advanceNo: null, submittedByName: "S", submittedByEmail: "s@x.co", payeeName: "P", amount: "1000.00", formDate: "2026-10-30", paymentMode: "NEFT" };
const sqlOf = (where: unknown) => new PgDialect().sqlToQuery(where as SQL).sql;

beforeEach(() => {
  Object.assign(fake.state, { selectRow: [], returning: [], execute: [], inserts: [], wheres: [], updates: [], failInsert: null });
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

describe("stage after a bulk payment, GST untouched", () => {
  it("the payment that reaches the payable amount settles the item (Fully Payment Settled) and never touches the GST flag", async () => {
    const sets: Array<Record<string, unknown>> = [];
    const realUpdate = fake.db.transaction;
    fake.db.transaction = (async (cb: (t: unknown) => unknown) => realUpdate(async (tx: Record<string, unknown>) => cb({
      ...tx,
      update: () => ({ set: (values: Record<string, unknown>) => { sets.push(values); return { where: () => ({ returning: async () => [], then: (r: (v: unknown) => unknown) => Promise.resolve(undefined).then(r) }) }; } }),
    }))) as typeof fake.db.transaction;
    fake.state.selectRow = [{ ...base, verifiedAt: new Date() }];
    fake.state.execute = [{ payable_amount: "1000.00", total_paid: "400.00", status: "SUBMITTED" }];
    const result = await recordNeftPayment(ID, "Abha", ["PAYMENT_ADVICE"], { amount: 600 }, { ip: null, extra: { bulk: true }, expectedTotalPaid: "400.00" });
    fake.db.transaction = realUpdate;
    expect(result).toMatchObject({ ok: true, data: { isFinal: true, totalPaid: "1000.00", remaining: "0.00" } });
    expect(sets[0]).toMatchObject({ totalPaid: "1000.00", status: "APPROVED", approvedByName: "Abha" });
    expect(Object.keys(sets[0]).filter((key) => key.toLowerCase().includes("gst"))).toEqual([]);
  });
});

describe("bulk payment of Basic when no payable calculation is saved", () => {
  const unset = { payable_amount: null, total_paid: "0.00", status: "SUBMITTED", is_advance: false, amount: "90300.00", basic_amount: "76525.42" };

  it("saves payable = Basic (TDS 0, arrears 0) in the same transaction, before the entry, with the audit note; then pays and settles", async () => {
    fake.state.selectRow = [{ ...base, verifiedAt: new Date() }];
    fake.state.execute = [unset];
    const result = await recordNeftPayment(ID, "Abha", ["PAYMENT_ADVICE"], { amount: 76525.42, remarks: "UTR / Ref: U9" }, { ip: "1.2.3.4", extra: { bulk: true, batchId: "b" }, expectedTotalPaid: "0.00", payableFromBasicIfUnset: true });
    expect(result).toMatchObject({ ok: true, data: { payableAmount: "76525.42", totalPaid: "76525.42", remaining: "0.00", isFinal: true } });
    expect(fake.state.updates[0]).toEqual({ arrearsAmount: "0.00", arrearsTdsPercent: "0.00", currentTdsPercent: "0.00", payableAmount: "76525.42", updatedAt: expect.any(Date) });
    expect(fake.state.updates[1]).toMatchObject({ totalPaid: "76525.42", status: "APPROVED" });
    expect(fake.state.inserts.map((i) => i.values.action ?? "entry")).toEqual(["PAYABLE_CALCULATION_SAVED", "entry", "PAYMENT_ENTRY_RECORDED"]);
    expect(fake.state.inserts[0].values).toMatchObject({ actor: "Abha", ipAddress: "1.2.3.4", details: { arrearsAmount: 0, currentTdsPercent: 0, payableAmount: 76525.42, note: "payable set to basic by bulk payment, no deductions", bulk: true, batchId: "b" } });
    expect(BULK_BASIC_PAYABLE_NOTE).toBe("payable set to basic by bulk payment, no deductions");
    expect(fake.state.inserts[2].values.details).toMatchObject({ payableAmount: "76525.42", isFinal: true });
    for (const set of fake.state.updates) expect(Object.keys(set).filter((key) => key.toLowerCase().includes("gst"))).toEqual([]);
    expect(fake.notifyPaymentEntry).toHaveBeenCalledTimes(1);
  });

  it("a partial amount leaves the item partly paid against Basic", async () => {
    fake.state.selectRow = [{ ...base, verifiedAt: new Date() }];
    fake.state.execute = [unset];
    const result = await recordNeftPayment(ID, "Abha", ["ALL"], { amount: 50000 }, { ip: null, expectedTotalPaid: "0.00", payableFromBasicIfUnset: true });
    expect(result).toMatchObject({ ok: true, data: { isFinal: false, remaining: "26525.42" } });
    expect(fake.state.updates[1]).not.toHaveProperty("status");
  });

  it("rolls back: if the payment write fails, the payable calculation is not saved either and no email goes out", async () => {
    fake.state.selectRow = [{ ...base, verifiedAt: new Date() }];
    fake.state.execute = [unset];
    fake.state.failInsert = (values) => "paidAt" in values;
    await expect(recordNeftPayment(ID, "Abha", ["ALL"], { amount: 100 }, { ip: null, expectedTotalPaid: "0.00", payableFromBasicIfUnset: true })).rejects.toThrow("insert failed");
    expect(fake.state.updates).toEqual([]);
    expect(fake.state.inserts).toEqual([]);
    expect(fake.notifyPaymentEntry).not.toHaveBeenCalled();
  });

  it("refuses above Basic, or with no Basic stored, before writing anything", async () => {
    for (const [row, amount, status] of [[unset, 76525.43, 400], [{ ...unset, basic_amount: null }, 1, 409]] as const) {
      fake.state.selectRow = [{ ...base, verifiedAt: new Date() }];
      fake.state.execute = [row];
      expect(await recordNeftPayment(ID, "Abha", ["ALL"], { amount }, { ip: null, expectedTotalPaid: "0.00", payableFromBasicIfUnset: true })).toMatchObject({ ok: false, status });
    }
    expect(fake.state.updates).toEqual([]);
    expect(fake.state.inserts).toEqual([]);
  });

  it("an NEFT Advance uses its amount as the base", async () => {
    fake.state.selectRow = [{ ...base, isAdvance: true, verifiedAt: new Date() }];
    fake.state.execute = [{ ...unset, is_advance: true, amount: "25000.00", basic_amount: null }];
    expect(await recordNeftPayment(ID, "Abha", ["ALL"], { amount: 25000 }, { ip: null, expectedTotalPaid: "0.00", payableFromBasicIfUnset: true })).toMatchObject({ ok: true, data: { payableAmount: "25000.00", isFinal: true } });
  });

  it("without the bulk option (the single Record a payment route) nothing changes: still refused", async () => {
    fake.state.selectRow = [{ ...base, verifiedAt: new Date() }];
    fake.state.execute = [unset];
    expect(await recordNeftPayment(ID, "Abha", ["ALL"], { amount: 100 }, { ip: null })).toEqual({ ok: false, status: 400, error: "Save the Arrears/TDS payable calculation before recording a payment." });
    expect(fake.state.inserts).toEqual([]);
  });

  it("a saved payable is used as before, even with the bulk option: no calculation is written", async () => {
    fake.state.selectRow = [{ ...base, verifiedAt: new Date() }];
    fake.state.execute = [{ ...unset, payable_amount: "70000.00" }, { ...unset, payable_amount: "70000.00" }];
    expect(await recordNeftPayment(ID, "Abha", ["ALL"], { amount: 70000.01 }, { ip: null, expectedTotalPaid: "0.00", payableFromBasicIfUnset: true })).toMatchObject({ ok: false, status: 400, error: "Amount exceeds the remaining balance of ₹ 70,000.00." });
    expect(await recordNeftPayment(ID, "Abha", ["ALL"], { amount: 70000 }, { ip: null, expectedTotalPaid: "0.00", payableFromBasicIfUnset: true })).toMatchObject({ ok: true, data: { payableAmount: "70000.00", isFinal: true } });
    expect(fake.state.inserts.map((i) => i.values.action ?? "entry")).toEqual(["entry", "PAYMENT_ENTRY_RECORDED"]);
    expect(fake.state.updates).toHaveLength(1);
  });
});

describe("Cash Voucher paid on the voucher amount (bulk passes it to the single Cash action)", () => {
  it("saves Bill passed for = voucher amount with Payment Done, in one write, with the note in the audit", async () => {
    fake.state.selectRow = [{ ...base, paymentMode: "CASH", status: "SUBMITTED", amount: "950.00", billPassedFor: null, payableAmount: null, verifiedAt: new Date(), paymentDoneAt: null }];
    fake.state.returning = [[{ id: ID }]];
    const result = await markCashPaymentDone(ID, "Abha", ["CASH_VOUCHER"], 950, { ip: null, extra: { bulk: true, note: "bill passed for set to the voucher amount by bulk payment, no deductions" } });
    expect(result.ok).toBe(true);
    expect(fake.state.updates[0]).toMatchObject({ billPassedFor: "950.00", status: "APPROVED" });
    expect(fake.state.inserts[0].values).toMatchObject({ action: "PAYMENT_DONE", details: { billPassedFor: 950, note: "bill passed for set to the voucher amount by bulk payment, no deductions" } });
  });
});
