import { describe, expect, it } from "vitest";
import { financialYearFor, formatSerial, allocateSerialNumber } from "./serial";

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

describe.skipIf(!testDbUrl)("allocateSerialNumber (integration)", () => {
  async function freshTestDb() {
    const { Pool } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-serverless");
    const schema = await import("./db/schema");
    const pool = new Pool({ connectionString: testDbUrl });
    const db = drizzle(pool, { schema });
    await db.execute(
      (await import("drizzle-orm")).sql`delete from serial_counters where financial_year = ${financialYearFor(TEST_DATE)}`,
    );
    return { db, pool };
  }

  it("issues 0001 as the first number of a new financial year", async () => {
    const { db, pool } = await freshTestDb();
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
    const { db, pool } = await freshTestDb();
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
});
