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

vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));

import { GET as publicVoucherGet } from "../../app/api/advice/[id]/cash-voucher-pdf/route";
import { GET as adminVoucherGet } from "../../app/api/admin/advice/[id]/cash-voucher-pdf/route";

describe("Cash voucher PDF routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    limit.mockResolvedValue([{ id: "11111111-1111-4111-8111-111111111111", paymentMode: "NEFT" }]);
  });

  it("returns a clean 404 (not empty/garbage PDF bytes) from the public route for an NEFT advice", async () => {
    const response = await publicVoucherGet(
      new NextRequest("http://localhost/api/advice/11111111-1111-4111-8111-111111111111/cash-voucher-pdf"),
      { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) },
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).not.toMatch(/application\/pdf/);
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
  });

  it("returns a clean 404 (not empty/garbage PDF bytes) from the admin route for an NEFT advice", async () => {
    const response = await adminVoucherGet(
      new NextRequest("http://localhost/api/admin/advice/11111111-1111-4111-8111-111111111111/cash-voucher-pdf"),
      { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) },
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).not.toMatch(/application\/pdf/);
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
  });
});
