import { sql } from "drizzle-orm";
import type { Database } from "./db";
import { serialCounters } from "./db/schema";

// Accepts either the top-level db handle or a transaction callback's `tx`
// argument — both expose `.execute()`, which is all this module needs.
type Executor = Pick<Database, "execute">;

const PAYMENT_ADVICE_SERIES = "PAYMENT_ADVICE";
const CASH_VOUCHER_SERIES = "CASH_VOUCHER";
const ADVANCE_SERIES = "ADVANCE";

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

export function formatCashVoucherNo(financialYear: string, number: number): string {
  return `CASH/MCCIA/${financialYear}/${String(number).padStart(4, "0")}`;
}

export function formatAdvanceNo(financialYear: string, number: number): string {
  return `ADV/MCCIA/${financialYear}/${String(number).padStart(4, "0")}`;
}

/**
 * Allocates the next number for the given (financial year, series) pair.
 * Must run inside a transaction; locks the counter row with SELECT ... FOR
 * UPDATE so concurrent submits never collide, and upserts the row if the
 * (financial year, series) pair doesn't exist yet. Shared by both the
 * PAYMENT_ADVICE and CASH_VOUCHER series — one allocation mechanism, two
 * independent counters.
 */
async function allocateNumber(
  tx: Executor,
  financialYear: string,
  series: string,
): Promise<number> {
  await tx.execute(sql`
    insert into ${serialCounters} (financial_year, series, last_number)
    values (${financialYear}, ${series}, 0)
    on conflict (financial_year, series) do nothing
  `);

  const rows = await tx.execute<{ last_number: number }>(sql`
    select last_number from ${serialCounters}
    where financial_year = ${financialYear} and series = ${series}
    for update
  `);

  const currentLast = Number(rows.rows[0].last_number);
  const nextNumber = currentLast + 1;

  await tx.execute(sql`
    update ${serialCounters}
    set last_number = ${nextNumber}
    where financial_year = ${financialYear} and series = ${series}
  `);

  return nextNumber;
}

/** Allocates the next main serial number (MCCIA/<FY>/NNNN) — every submission,
 * regardless of payment mode. This stays the DB/audit-log/Excel identifier. */
export async function allocateSerialNumber(
  tx: Executor,
  date: Date,
): Promise<{ serialNo: string; financialYear: string }> {
  const financialYear = financialYearFor(date);
  const nextNumber = await allocateNumber(tx, financialYear, PAYMENT_ADVICE_SERIES);
  return { serialNo: formatSerial(financialYear, nextNumber), financialYear };
}

/** Allocates the next Cash Voucher number (CASH/MCCIA/<FY>/NNNN) — CASH-mode
 * submissions only, independent counter from the main serial number. */
export async function allocateCashVoucherNumber(
  tx: Executor,
  financialYear: string,
): Promise<string> {
  const nextNumber = await allocateNumber(tx, financialYear, CASH_VOUCHER_SERIES);
  return formatCashVoucherNo(financialYear, nextNumber);
}

/** Allocates the next Advance number (ADV/MCCIA/<FY>/NNNN) — isAdvance = true
 * submissions only, one shared counter regardless of whether the advance
 * routes to NEFT or Cash (not two separate ADV series). Independent from
 * both the main serial number and the Cash Voucher number. */
export async function allocateAdvanceNumber(
  tx: Executor,
  financialYear: string,
): Promise<string> {
  const nextNumber = await allocateNumber(tx, financialYear, ADVANCE_SERIES);
  return formatAdvanceNo(financialYear, nextNumber);
}
