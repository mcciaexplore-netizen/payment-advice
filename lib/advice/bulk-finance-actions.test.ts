import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** db.select() calls in order: [loaded rows], [ids in the right stage]. */
const fake = vi.hoisted(() => ({
  selects: [] as unknown[][],
  session: null as unknown,
  receive: vi.fn(), verify: vi.fn(), cashDone: vi.fn(), neft: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { select: () => { const node: Record<string, unknown> = {}; node.from = () => node; node.where = () => node; node.then = (resolve: (v: unknown) => unknown) => Promise.resolve(fake.selects.shift() ?? []).then(resolve); return node; } } }));
vi.mock("@/lib/admin-session", () => ({ getAdminSession: async () => fake.session }));
vi.mock("@/lib/advice/finance-stage-actions", () => ({ receiveAdvice: fake.receive, verifyAdvice: fake.verify, markCashPaymentDone: fake.cashDone, recordNeftPayment: fake.neft }));

import { POST } from "@/app/api/admin/advice/bulk/route";
import { bulkActionForTab, runBulkFinanceAction } from "@/lib/advice/bulk-finance-actions";
import type { AdminRole } from "@/lib/auth";

const id = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
const BATCH = "99999999-9999-4999-8999-999999999999";
const row = (n: number, extra: Record<string, unknown> = {}) => ({
  id: id(n), serialNo: `MCCIA/2026-27/${String(n).padStart(4, "0")}`, cashVoucherNo: null, isAdvance: false, advanceNo: null, paymentMode: "NEFT",
  status: "SUBMITTED", amount: "1000.00", payableAmount: "1000.00", billPassedFor: null, totalPaid: "0",
  authorityApprovedAt: new Date(), financeReceivedAt: new Date(), verifiedAt: new Date(), paymentDoneAt: null, sentBackAt: null, rejectedAt: null, updatedAt: new Date(), ...extra,
});
const cash = (n: number, extra: Record<string, unknown> = {}) => row(n, { paymentMode: "CASH", cashVoucherNo: `CASH/MCCIA/2026-27/${String(n).padStart(4, "0")}`, billPassedFor: "900.00", payableAmount: null, ...extra });
const session = (roles: string[], fullName = "Finance User") => ({ adminUserId: "u", fullName, roles: roles as AdminRole[], recommendingAuthorityId: null });
const post = (body: unknown) => POST(new NextRequest("http://localhost/api/admin/advice/bulk", { method: "POST", body: JSON.stringify(body), headers: { "x-forwarded-for": "198.51.100.1" } }));
const ok = { ok: true, data: {} };

beforeEach(() => {
  fake.selects = [];
  for (const fn of [fake.receive, fake.verify, fake.cashDone, fake.neft]) { fn.mockReset(); fn.mockResolvedValue(ok); }
  fake.session = session(["ALL"]);
});

describe("bulk Finance actions: access", () => {
  it("no session 401, non-Finance 403, nothing processed", async () => {
    fake.session = null;
    expect((await post({ action: "verify", batchId: BATCH, items: [{ id: id(1) }] })).status).toBe(401);
    fake.session = session(["BRANCH"]);
    expect((await post({ action: "verify", batchId: BATCH, items: [{ id: id(1) }] })).status).toBe(403);
    expect(fake.verify).not.toHaveBeenCalled();
  });

  it.each([["PAYMENT_ADVICE"], ["CASH_VOUCHER"], ["ALL"]])("%s can mark received and verified on any submission type", async (role) => {
    fake.session = session([role]);
    fake.selects = [[row(1), cash(2)], [{ id: id(1) }, { id: id(2) }]];
    const body = await (await post({ action: "verify", batchId: BATCH, items: [{ id: id(1) }, { id: id(2) }] })).json();
    expect(body.results.map((r: { outcome: string }) => r.outcome)).toEqual(["done", "done"]);
  });

  it("payment: PAYMENT_ADVICE pays NEFT only, CASH_VOUCHER Cash only (others skipped), ALL both", async () => {
    const items = [{ id: id(1), amount: 1000, reference: "UTR1", expectedTotalPaid: "0.00" }, { id: id(2) }];
    for (const [role, expected] of [["PAYMENT_ADVICE", ["done", "skipped"]], ["CASH_VOUCHER", ["skipped", "done"]], ["ALL", ["done", "done"]]] as const) {
      fake.session = session([role]);
      fake.selects = [[row(1), cash(2)], [{ id: id(1) }, { id: id(2) }]];
      const body = await (await post({ action: "payment", batchId: BATCH, items })).json();
      const byId = Object.fromEntries(body.results.map((r: { id: string; outcome: string }) => [r.id, r.outcome]));
      expect([byId[id(1)], byId[id(2)]]).toEqual(expected);
    }
  });
});

describe("bulk Finance actions: stage and results", () => {
  it("items no longer in the action's stage are skipped with their current stage, never forced", async () => {
    fake.selects = [[row(1), row(2, { verifiedAt: new Date() })], [{ id: id(1) }]];
    const body = await (await post({ action: "receive", batchId: BATCH, items: [{ id: id(1) }, { id: id(2) }] })).json();
    expect(fake.receive).toHaveBeenCalledTimes(1);
    expect(body.results.find((r: { id: string }) => r.id === id(2))).toMatchObject({ outcome: "skipped", message: expect.stringContaining("No longer in Awaiting Finance Review") });
  });

  it("mixed batch: done, skipped (already done meanwhile), failed (error) and not found; one failure never stops the others", async () => {
    fake.selects = [[row(1), row(2), row(3)], [{ id: id(1) }, { id: id(2) }, { id: id(3) }]];
    fake.verify.mockResolvedValueOnce(ok).mockResolvedValueOnce({ ok: false, status: 409, error: "Already verified." }).mockRejectedValueOnce(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const body = await (await post({ action: "verify", batchId: BATCH, items: [{ id: id(1) }, { id: id(2) }, { id: id(3) }, { id: id(4) }] })).json();
    expect(body.results.map((r: { outcome: string; message: string }) => [r.outcome, r.message])).toEqual([
      ["skipped", "Not found."],
      ["done", "Verified. Submitter emailed."],
      ["skipped", "Already verified."],
      ["failed", "Unexpected error. Nothing was changed for this item."],
    ]);
  });

  it("uses the session user, never one from the browser, and tags audit entries as bulk with the batch id", async () => {
    fake.session = session(["ALL"], "Abha Khatavkar");
    fake.selects = [[row(1)], [{ id: id(1) }]];
    await post({ action: "verify", batchId: BATCH, items: [{ id: id(1), verifiedBy: "Someone Else", verifiedAt: "2020-01-01" }], actor: "x" });
    expect(fake.verify).toHaveBeenCalledWith(id(1), "Abha Khatavkar", { ip: "198.51.100.1", extra: { bulk: true, batchId: BATCH, bulkBy: "Abha Khatavkar" } });
  });

  it("limits a request to 50 items and refuses duplicates", async () => {
    const items = Array.from({ length: 51 }, (_, i) => ({ id: id(i + 1) }));
    expect((await post({ action: "receive", batchId: BATCH, items })).status).toBe(400);
    expect((await post({ action: "receive", batchId: BATCH, items: [{ id: id(1) }, { id: id(1) }] })).status).toBe(400);
    expect(fake.receive).not.toHaveBeenCalled();
  });

  it("stops before the time limit and reports the rest as not processed", async () => {
    fake.selects = [[row(1), row(2)], [{ id: id(1) }, { id: id(2) }]];
    const response = await runBulkFinanceAction(session(["ALL"]), { action: "receive", batchId: BATCH, dryRun: false, items: [{ id: id(1) }, { id: id(2) }] }, null, { deadlineMs: Date.now() - 1 });
    expect(response.kind === "processed" && response.results.every((r) => r.message.includes("time limit"))).toBe(true);
    expect(fake.receive).not.toHaveBeenCalled();
  });

  it("maps tabs to actions", () => {
    expect([bulkActionForTab("awaiting_finance"), bulkActionForTab("advance_payment"), bulkActionForTab("received_in_process"), bulkActionForTab("verified_ready_payment"), bulkActionForTab("partial_payment_done"), bulkActionForTab("sent_back")])
      .toEqual(["receive", "receive", "verify", "payment", null, null]);
  });
});

describe("bulk payment rows", () => {
  const pay = (items: unknown[], dryRun = false) => post({ action: "payment", batchId: BATCH, dryRun, items });

  it.each([
    ["missing UTR", { amount: 1000, expectedTotalPaid: "0.00" }, "Enter the UTR or payment reference."],
    ["zero amount", { amount: 0, reference: "U", expectedTotalPaid: "0.00" }, "Enter an amount paid greater than 0."],
    ["three decimals", { amount: 10.123, reference: "U", expectedTotalPaid: "0.00" }, "The amount can have at most 2 decimal places."],
    ["more than remaining", { amount: 1000.01, reference: "U", expectedTotalPaid: "0.00" }, "The amount is more than the remaining ₹ 1,000.00."],
  ])("%s rejects the whole batch and pays nothing", async (_label, input, message) => {
    fake.selects = [[row(1), row(2)], [{ id: id(1) }, { id: id(2) }]];
    const response = await pay([{ id: id(1), ...input }, { id: id(2), amount: 1000, reference: "UTR2", expectedTotalPaid: "0.00" }]);
    expect(response.status).toBe(400);
    expect((await response.json()).errors).toEqual([{ id: id(1), reference: "MCCIA/2026-27/0001", error: message }]);
    expect(fake.neft).not.toHaveBeenCalled();
  });

  it("refuses NEFT rows without a saved payable amount and Cash rows without Bill Passed For", async () => {
    fake.selects = [[row(1, { payableAmount: null }), cash(2, { billPassedFor: null }), cash(3, { isAdvance: true, advanceNo: "ADV/1", payableAmount: null })], [{ id: id(1) }, { id: id(2) }, { id: id(3) }]];
    const body = await (await pay([{ id: id(1), amount: 1, reference: "U", expectedTotalPaid: "0.00" }, { id: id(2) }, { id: id(3) }])).json();
    expect(body.errors.map((e: { error: string }) => e.error)).toEqual([
      "Save the Arrears/TDS payable calculation on this advice first.",
      "Save Bill passed for Rs. on this advice first.",
      "Save the Arrears/TDS payable calculation on this advice first.",
    ]);
  });

  it("a partial NEFT amount is allowed and goes through the single-item function with the UTR in remarks and the seen total", async () => {
    fake.selects = [[row(1, { payableAmount: "1000.00" })], [{ id: id(1) }]];
    fake.neft.mockResolvedValue({ ok: true, data: { isFinal: false } });
    const body = await (await pay([{ id: id(1), amount: 400, reference: " UTR123 ", expectedTotalPaid: "0.00" }])).json();
    expect(fake.neft).toHaveBeenCalledWith(id(1), "Finance User", { amount: 400, remarks: "UTR / Ref: UTR123" }, expect.objectContaining({ expectedTotalPaid: "0.00", extra: expect.objectContaining({ bulk: true }) }));
    expect(body.results[0]).toMatchObject({ outcome: "done", message: "Partial payment recorded. Submitter emailed." });
  });

  it("Cash rows use the saved Bill Passed For: any amount the browser sends is not used", async () => {
    fake.selects = [[cash(1)], [{ id: id(1) }]];
    await pay([{ id: id(1), amount: 5 }]);
    expect(fake.cashDone).toHaveBeenCalledWith(id(1), "Finance User", undefined, expect.objectContaining({ extra: expect.objectContaining({ bulk: true }) }));
  });

  it("dryRun checks the whole batch and changes nothing", async () => {
    fake.selects = [[row(1)], [{ id: id(1) }]];
    const response = await pay([{ id: id(1), amount: 1000, reference: "U", expectedTotalPaid: "0.00" }], true);
    expect((await response.json()).kind).toBe("checked");
    expect(fake.neft).not.toHaveBeenCalled();
  });
});
