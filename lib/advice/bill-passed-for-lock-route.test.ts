import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  updateSet: vi.fn(() => ({ where: vi.fn() })),
  update: vi.fn(() => ({ set: mocks.updateSet })),
}));

vi.mock("@/lib/db", () => ({ db: { select: mocks.select, update: mocks.update } }));

import { PATCH } from "../../app/api/admin/advice/[id]/route";

const ADVICE_ID = "33333333-3333-4333-8333-333333333333";

function mockQueries(advice: { status: string; amount: string } | null, entryCount: number) {
  mocks.select
    .mockImplementationOnce(() => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve(advice ? [advice] : []) }) }),
    }))
    .mockImplementationOnce(() => ({
      from: () => ({ where: () => Promise.resolve([{ count: entryCount }]) }),
    }));
}

function req(body: unknown) {
  return new NextRequest(`http://localhost/api/admin/advice/${ADVICE_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/admin/advice/[id] (Bill passed for Rs.)", () => {
  beforeEach(() => {
    // mockReset (not clearAllMocks) — clearAllMocks leaves any unconsumed
    // queued mockImplementationOnce entries in place, which then leak into
    // the next test's first call (a test that 404s before reaching the
    // second select() leaves that second queued implementation for the
    // next test to accidentally consume first).
    mocks.select.mockReset();
    mocks.update.mockReset();
    mocks.updateSet.mockReset();
    mocks.update.mockImplementation(() => ({ set: mocks.updateSet }));
    mocks.updateSet.mockImplementation(() => ({ where: vi.fn() }));
  });

  it("404s when the advice doesn't exist", async () => {
    mockQueries(null, 0);
    const res = await PATCH(req({ billPassedFor: 500 }), { params: Promise.resolve({ id: ADVICE_ID }) });
    expect(res.status).toBe(404);
  });

  it("409s when already approved (pre-existing behavior, unchanged)", async () => {
    mocks.select.mockImplementationOnce(() => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([{ status: "APPROVED", amount: "1000.00" }]) }) }),
    }));
    const res = await PATCH(req({ billPassedFor: 500 }), { params: Promise.resolve({ id: ADVICE_ID }) });
    expect(res.status).toBe(409);
    // Never even checks payment_entries once already-approved short-circuits.
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });

  it("409s once a payment entry has been recorded — the cap is locked", async () => {
    mockQueries({ status: "SUBMITTED", amount: "1000.00" }, 1);
    const res = await PATCH(req({ billPassedFor: 700 }), { params: Promise.resolve({ id: ADVICE_ID }) });
    const data = await res.json();
    expect(res.status).toBe(409);
    expect(data.error).toContain("locked");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("still allows editing when no payment entries exist yet", async () => {
    mockQueries({ status: "SUBMITTED", amount: "1000.00" }, 0);
    const res = await PATCH(req({ billPassedFor: 700 }), { params: Promise.resolve({ id: ADVICE_ID }) });
    expect(res.status).toBe(200);
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ billPassedFor: "700.00" }),
    );
  });
});
