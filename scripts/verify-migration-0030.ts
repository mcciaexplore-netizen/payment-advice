/**
 * Read-only check that migration 0030 (refund_requests) is applied exactly
 * as generated, and that lib/db/schema.ts and the database now match.
 * Every query runs inside a READ ONLY transaction, so this script cannot
 * write even by mistake.
 *
 * Usage (after `npm run db:migrate`): npx tsx scripts/verify-migration-0030.ts
 * Exit code 0 = all checks passed, 1 = something to look at.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "../lib/db/schema";

neonConfig.webSocketConstructor = ws;

const MIGRATION_TAG = "0030_refund_requests";
const failures: string[] = [];
const check = (ok: boolean, label: string, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures.push(label);
};

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const journal = JSON.parse(fs.readFileSync(path.join(process.cwd(), "lib/db/migrations/meta/_journal.json"), "utf8")) as { entries: Array<{ tag: string; when: number }> };
  const entry = journal.entries.find((candidate) => candidate.tag === MIGRATION_TAG);
  if (!entry) throw new Error(`${MIGRATION_TAG} is not in the journal`);
  const fileHash = createHash("sha256").update(fs.readFileSync(path.join(process.cwd(), `lib/db/migrations/${MIGRATION_TAG}.sql`))).digest("hex");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");

    // 1. Recorded as the newest migration, with this exact file's hash.
    const { rows: [latest] } = await client.query("select id, hash, created_at from drizzle.__drizzle_migrations order by created_at desc limit 1");
    check(Number(latest?.created_at) === entry.when, "0030 is the newest recorded migration", `db created_at ${latest?.created_at}, journal when ${entry.when}, id ${latest?.id}`);
    check(latest?.hash === fileHash, "recorded hash matches 0030_refund_requests.sql");

    // 2. Every table and column in schema.ts exists with the same nullability, and no extras.
    const { rows: columns } = await client.query("select table_name, column_name, is_nullable from information_schema.columns where table_schema = 'public'");
    const { rows: constraints } = await client.query("select conname from pg_constraint where connamespace = 'public'::regnamespace");
    const live = new Map<string, Map<string, boolean>>();
    for (const row of columns) {
      if (!live.has(row.table_name)) live.set(row.table_name, new Map());
      live.get(row.table_name)!.set(row.column_name, row.is_nullable === "YES");
    }
    const constraintNames = new Set(constraints.map((row) => row.conname as string));
    const drift: string[] = [];
    const codeTables = new Set<string>();
    for (const value of Object.values(schema)) {
      if (!is(value, PgTable)) continue;
      const table = getTableConfig(value);
      codeTables.add(table.name);
      const liveColumns = live.get(table.name);
      if (!liveColumns) { drift.push(`missing table ${table.name}`); continue; }
      for (const column of table.columns) {
        if (!liveColumns.has(column.name)) drift.push(`missing column ${table.name}.${column.name}`);
        else if (liveColumns.get(column.name) === column.notNull) drift.push(`nullability differs ${table.name}.${column.name}`);
      }
      for (const name of liveColumns.keys()) if (!table.columns.some((column) => column.name === name)) drift.push(`extra column ${table.name}.${name}`);
      for (const constraint of table.checks) if (!constraintNames.has(constraint.name)) drift.push(`missing check ${constraint.name}`);
    }
    for (const name of live.keys()) if (!codeTables.has(name)) drift.push(`extra table ${name}`);
    check(drift.length === 0, "schema.ts and the database match (tables, columns, nullability, CHECKs)", drift.join("; "));

    // 3. The specific objects 0030 adds.
    for (const name of [
      "refund_requests_serial_no_unique",
      "refund_requests_branch_check",
      "refund_requests_basic_amount_check",
      "refund_requests_gst_amount_check",
      "refund_requests_total_positive_check",
      "refund_requests_total_matches_check",
      "refund_requests_from_date_check",
      "refund_requests_bank_ifsc_check",
      "refund_requests_payee_gstin_check",
      "refund_requests_documents_array_check",
      "audit_log_refund_request_id_refund_requests_id_fk",
    ]) check(constraintNames.has(name), `constraint ${name}`);
    check(live.get("audit_log")?.get("refund_request_id") === true, "audit_log.refund_request_id exists and is nullable");

    // 4. Nothing has been written yet (the flag must still be off).
    if (live.has("refund_requests")) {
      const { rows: [{ n }] } = await client.query("select count(*)::int as n from refund_requests");
      check(n === 0, "refund_requests is empty", `${n} rows`);
    } else check(false, "refund_requests exists");
    const { rows: counters } = await client.query("select financial_year, last_number from serial_counters where series = 'REFUND'");
    check(counters.length === 0, "no REFUND serial counter yet", JSON.stringify(counters));

    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end();
  }
  console.log(failures.length ? `\n${failures.length} check(s) failed.` : "\nAll checks passed. Safe to merge feature/refund-request-db and redeploy (flag still off).");
  process.exitCode = failures.length ? 1 : 0;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
