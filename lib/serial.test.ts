import { describe, expect, it } from "vitest";
import {
  financialYearFor,
  formatSerial,
  formatCashVoucherNo,
  allocateSerialNumber,
  allocateCashVoucherNumber,
} from "./serial";

describe("financialYearFor", () => {
  it("treats 31 March as the last day of the FY that started the previous April", () => {
    expect(financialYearFor(new Date(2027, 2, 31))).toBe("2026-27");
  });

  it("treats 1 April as the first day of the new FY", () => {
    expect(financialYearFor(new Date(2027, 3, 1))).toBe("2027-28");
  });

  it("treats 2 April as already inside the new FY", () => {
    expect(financialYearFor(new Date(2027, 3, 2))).toBe("2027-28");
  });

  it("treats a mid-year date as the FY that started the same calendar year", () => {
    expect(financialYearFor(new Date(2026, 6, 28))).toBe("2026-27");
  });

  it("treats a Jan-Mar date as belonging to the previous calendar year's FY", () => {
    expect(financialYearFor(new Date(2027, 1, 15))).toBe("2026-27");
  });
});

describe("formatSerial", () => {
  it("zero-pads the sequence to 4 digits", () => {
    expect(formatSerial("2026-27", 1)).toBe("MCCIA/2026-27/0001");
    expect(formatSerial("2026-27", 42)).toBe("MCCIA/2026-27/0042");
  });

  it("does not truncate a 5-digit sequence", () => {
    expect(formatSerial("2026-27", 10000)).toBe("MCCIA/2026-27/10000");
  });
});

describe("formatCashVoucherNo", () => {
  it("zero-pads the sequence to 4 digits, prefixed with CASH/", () => {
    expect(formatCashVoucherNo("2026-27", 1)).toBe("CASH/MCCIA/2026-27/0001");
    expect(formatCashVoucherNo("2026-27", 42)).toBe("CASH/MCCIA/2026-27/0042");
  });

  it("does not truncate a 5-digit sequence", () => {
    expect(formatCashVoucherNo("2026-27", 10000)).toBe("CASH/MCCIA/2026-27/10000");
  });
});

// Integration tests below exercise the real `SELECT ... FOR UPDATE` allocation
// path and need a live Postgres connection. They run only when
// TEST_DATABASE_URL is explicitly set (point this at a scratch Neon branch
// or local Postgres — never at the app's real DATABASE_URL) and are skipped
// otherwise so `vitest` stays green with no DB configured. A fixed
// far-past "financial year" (derived from a fixed 1999 date) keeps these
// tests from ever touching a row a real submission could use, and each test
// clears that row first so reruns are idempotent.
const testDbUrl = process.env.TEST_DATABASE_URL;
const TEST_DATE = new Date(1999, 6, 15); // -> FY "1999-00", never issued by the real app
// Straddles the FY boundary the same way the financialYearFor tests above
// do, but far enough in the past ("1998-99" / "1999-00") that a real
// submission could never collide with these rows.
const TEST_DATE_OLD_FY_LAST_DAY = new Date(1999, 2, 31); // 31 Mar -> FY "1998-99"
const TEST_DATE_NEW_FY_FIRST_DAY = new Date(1999, 3, 1); // 1 Apr -> FY "1999-00"

describe.skipIf(!testDbUrl)("allocateSerialNumber / allocateCashVoucherNumber (integration)", () => {
  async function freshTestDb(financialYears: string[]) {
    const { Pool } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-serverless");
    const schema = await import("./db/schema");
    const { inArray } = await import("drizzle-orm");
    const pool = new Pool({ connectionString: testDbUrl });
    const db = drizzle(pool, { schema });
    await db.delete(schema.serialCounters).where(inArray(schema.serialCounters.financialYear, financialYears));
    return { db, pool };
  }

  it("issues 0001 as the first number of a new financial year", async () => {
    const { db, pool } = await freshTestDb([financialYearFor(TEST_DATE)]);
    try {
      const result = await db.transaction((tx) =>
        allocateSerialNumber(tx, TEST_DATE),
      );
      expect(result.serialNo).toBe(`MCCIA/${financialYearFor(TEST_DATE)}/0001`);
    } finally {
      await pool.end();
    }
  });

  it("never issues the same number twice under concurrent allocation", async () => {
    const { db, pool } = await freshTestDb([financialYearFor(TEST_DATE)]);
    try {
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          db.transaction((tx) => allocateSerialNumber(tx, TEST_DATE)),
        ),
      );
      const serials = results.map((r) => r.serialNo);
      expect(new Set(serials).size).toBe(serials.length);
    } finally {
      await pool.end();
    }
  });

  it("issues 0001 as the first Cash Voucher number of a new financial year", async () => {
    const financialYear = financialYearFor(TEST_DATE);
    const { db, pool } = await freshTestDb([financialYear]);
    try {
      const cashVoucherNo = await db.transaction((tx) =>
        allocateCashVoucherNumber(tx, financialYear),
      );
      expect(cashVoucherNo).toBe(`CASH/MCCIA/${financialYear}/0001`);
    } finally {
      await pool.end();
    }
  });

  it("keeps the Cash Voucher series independent of the main series within the same FY", async () => {
    const financialYear = financialYearFor(TEST_DATE);
    const { db, pool } = await freshTestDb([financialYear]);
    try {
      // Allocate three main serials first, so its counter is well ahead...
      for (let i = 0; i < 3; i++) {
        await db.transaction((tx) => allocateSerialNumber(tx, TEST_DATE));
      }
      // ...the Cash Voucher series still starts fresh at 0001 regardless.
      const cashVoucherNo = await db.transaction((tx) =>
        allocateCashVoucherNumber(tx, financialYear),
      );
      expect(cashVoucherNo).toBe(`CASH/MCCIA/${financialYear}/0001`);

      // And allocating more main serials afterward doesn't advance the
      // Cash Voucher counter either.
      await db.transaction((tx) => allocateSerialNumber(tx, TEST_DATE));
      const secondCashVoucherNo = await db.transaction((tx) =>
        allocateCashVoucherNumber(tx, financialYear),
      );
      expect(secondCashVoucherNo).toBe(`CASH/MCCIA/${financialYear}/0002`);
    } finally {
      await pool.end();
    }
  });

  it("resets the Cash Voucher series independently across the 31 Mar -> 1 Apr FY boundary", async () => {
    const oldFy = financialYearFor(TEST_DATE_OLD_FY_LAST_DAY);
    const newFy = financialYearFor(TEST_DATE_NEW_FY_FIRST_DAY);
    expect(oldFy).not.toBe(newFy);
    const { db, pool } = await freshTestDb([oldFy, newFy]);
    try {
      const oldFyFirst = await db.transaction((tx) =>
        allocateCashVoucherNumber(tx, oldFy),
      );
      const oldFySecond = await db.transaction((tx) =>
        allocateCashVoucherNumber(tx, oldFy),
      );
      const newFyFirst = await db.transaction((tx) =>
        allocateCashVoucherNumber(tx, newFy),
      );
      expect(oldFyFirst).toBe(`CASH/MCCIA/${oldFy}/0001`);
      expect(oldFySecond).toBe(`CASH/MCCIA/${oldFy}/0002`);
      expect(newFyFirst).toBe(`CASH/MCCIA/${newFy}/0001`);
    } finally {
      await pool.end();
    }
  });

  it("never allocates a Cash Voucher number for a NEFT submission — allocateSerialNumber alone touches only the main series", async () => {
    const financialYear = financialYearFor(TEST_DATE);
    const { db, pool } = await freshTestDb([financialYear]);
    try {
      // Simulates what the submit route does for payment_mode = 'NEFT':
      // only allocateSerialNumber runs, allocateCashVoucherNumber is never
      // called.
      await db.transaction((tx) => allocateSerialNumber(tx, TEST_DATE));

      const { eq, and } = await import("drizzle-orm");
      const schema = await import("./db/schema");
      const rows = await db
        .select()
        .from(schema.serialCounters)
        .where(
          and(
            eq(schema.serialCounters.financialYear, financialYear),
            eq(schema.serialCounters.series, "CASH_VOUCHER"),
          ),
        );
      expect(rows).toHaveLength(0);
    } finally {
      await pool.end();
    }
  });
});
