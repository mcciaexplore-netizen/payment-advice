import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  const where = vi.fn();
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { where, from, select };
});

vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));

import { countInProgressForAuthority, countInProgressForStaffName } from "./deactivation-safety";

describe("countInProgressForAuthority", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the count from the query result", async () => {
    mocks.where.mockResolvedValueOnce([{ count: 3 }]);
    await expect(countInProgressForAuthority("authority-id")).resolves.toBe(3);
  });

  it("returns 0 when the query yields no row", async () => {
    mocks.where.mockResolvedValueOnce([]);
    await expect(countInProgressForAuthority("authority-id")).resolves.toBe(0);
  });
});

describe("countInProgressForStaffName", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the count from the query result", async () => {
    mocks.where.mockResolvedValueOnce([{ count: 2 }]);
    await expect(countInProgressForStaffName("Priya Sharma")).resolves.toBe(2);
  });

  it("returns 0 when the query yields no row", async () => {
    mocks.where.mockResolvedValueOnce([]);
    await expect(countInProgressForStaffName("Priya Sharma")).resolves.toBe(0);
  });
});
