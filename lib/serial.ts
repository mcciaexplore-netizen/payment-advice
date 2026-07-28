import { sql } from "drizzle-orm";
import type { Database } from "./db";
import { serialCounters } from "./db/schema";

// Accepts either the top-level db handle or a transaction callback's `tx`
// argument — both expose `.execute()`, which is all this module needs.
type Executor = Pick<Database, "execute">;

/**
 * Indian financial year runs 1 April -> 31 March.
 * Jan-Mar belong to the FY that started the previous calendar year.
 */
export function financialYearFor(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed; 0 = Jan, 3 = Apr
  const startYear = month >= 3 ? year : year - 1;
  const endYearShort = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${endYearShort}`;
}

export function formatSerial(financialYear: string, number: number): string {
  return `MCCIA/${financialYear}/${String(number).padStart(4, "0")}`;
}

/**
 * Allocates the next serial number for the given date's financial year.
 * Must run inside a transaction; locks the counter row with SELECT ... FOR
 * UPDATE so concurrent submits never collide, and upserts the row if the FY
 * doesn't exist yet.
 */
export async function allocateSerialNumber(
  tx: Executor,
  date: Date,
): Promise<{ serialNo: string; financialYear: string }> {
  const financialYear = financialYearFor(date);

  await tx.execute(sql`
    insert into ${serialCounters} (financial_year, last_number)
    values (${financialYear}, 0)
    on conflict (financial_year) do nothing
  `);

  const rows = await tx.execute<{ last_number: number }>(sql`
    select last_number from ${serialCounters}
    where financial_year = ${financialYear}
    for update
  `);

  const currentLast = Number(rows.rows[0].last_number);
  const nextNumber = currentLast + 1;

  await tx.execute(sql`
    update ${serialCounters}
    set last_number = ${nextNumber}
    where financial_year = ${financialYear}
  `);

  return { serialNo: formatSerial(financialYear, nextNumber), financialYear };
}
