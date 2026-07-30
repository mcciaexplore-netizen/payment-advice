import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const limit = vi.fn();
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { limit, where, from, select };
});
const { limit } = mocks;

vi.mock("@/lib/db", () => ({ db: { select: mocks.select, insert: vi.fn(() => ({ values: vi.fn() })) } }));

import { GET as publicAdviceGet } from "../../app/api/advice/[id]/pdf/route";
import { GET as adminAdviceGet } from "../../app/api/admin/advice/[id]/pdf/route";

const ADVICE_ID = "11111111-1111-4111-8111-111111111111";

describe("Payment Advice PDF routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("404s from the public route for a Cash advice (only the Cash Voucher PDF exists for Cash)", async () => {
    limit.mockResolvedValue([{ id: ADVICE_ID, paymentMode: "CASH" }]);
    const response = await publicAdviceGet(
      new NextRequest(`http://localhost/api/advice/${ADVICE_ID}/pdf`),
      { params: Promise.resolve({ id: ADVICE_ID }) },
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).not.toMatch(/application\/pdf/);
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
  });

  it("404s from the admin route for a Cash advice, even when APPROVED", async () => {
    limit.mockResolvedValue([{ id: ADVICE_ID, paymentMode: "CASH", status: "APPROVED" }]);
    const response = await adminAdviceGet(
      new NextRequest(`http://localhost/api/admin/advice/${ADVICE_ID}/pdf`),
      { params: Promise.resolve({ id: ADVICE_ID }) },
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).not.toMatch(/application\/pdf/);
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
  });

  it("404s from both routes when the advice doesn't exist at all", async () => {
    limit.mockResolvedValue([]);
    const publicResponse = await publicAdviceGet(
      new NextRequest(`http://localhost/api/advice/${ADVICE_ID}/pdf`),
      { params: Promise.resolve({ id: ADVICE_ID }) },
    );
    const adminResponse = await adminAdviceGet(
      new NextRequest(`http://localhost/api/admin/advice/${ADVICE_ID}/pdf`),
      { params: Promise.resolve({ id: ADVICE_ID }) },
    );
    expect(publicResponse.status).toBe(404);
    expect(adminResponse.status).toBe(404);
  });

  it("does not 404 an NEFT advice on the paymentMode check (falls through to the status/render path)", async () => {
    // Admin route: NEFT + not yet APPROVED should hit the 409 status gate,
    // not the 404 paymentMode gate — proves the Cash check doesn't
    // over-match NEFT.
    limit.mockResolvedValue([{ id: ADVICE_ID, paymentMode: "NEFT", status: "SUBMITTED" }]);
    const response = await adminAdviceGet(
      new NextRequest(`http://localhost/api/admin/advice/${ADVICE_ID}/pdf`),
      { params: Promise.resolve({ id: ADVICE_ID }) },
    );
    expect(response.status).toBe(409);
  });
});
