/**
 * Read-only check that migration 0031 (Cash Receipt "Cash received"
 * columns) is applied exactly as generated, and that lib/db/schema.ts and
 * the database now match. Every query runs inside a READ ONLY transaction,
 * so this script cannot write even by mistake.
 *
 * Usage (after `npm run db:migrate`): npx tsx scripts/verify-migration-0031.ts
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

const MIGRATION_TAG = "0031_cash_receipt_received";
const NEW_COLUMNS: Record<string, string> = {
  received_at: "timestamp with time zone",
  received_by: "text",
  received_note: "text",
  received_email_sent_at: "timestamp with time zone",
};
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
    check(Number(latest?.created_at) === entry.when, "0031 is the newest recorded migration", `db created_at ${latest?.created_at}, journal when ${entry.when}, id ${latest?.id}`);
    check(latest?.hash === fileHash, "recorded hash matches 0031_cash_receipt_received.sql");

    // 2. Every table and column in schema.ts exists with the same nullability, and no extras.
    const { rows: columns } = await client.query("select table_name, column_name, is_nullable, data_type from information_schema.columns where table_schema = 'public'");
    const { rows: constraints } = await client.query("select conname from pg_constraint where connamespace = 'public'::regnamespace");
    const live = new Map<string, Map<string, { nullable: boolean; type: string }>>();
    for (const row of columns) {
      if (!live.has(row.table_name)) live.set(row.table_name, new Map());
      live.get(row.table_name)!.set(row.column_name, { nullable: row.is_nullable === "YES", type: row.data_type });
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
        else if (liveColumns.get(column.name)!.nullable === column.notNull) drift.push(`nullability differs ${table.name}.${column.name}`);
      }
      for (const name of liveColumns.keys()) if (!table.columns.some((column) => column.name === name)) drift.push(`extra column ${table.name}.${name}`);
      for (const constraint of table.checks) if (!constraintNames.has(constraint.name)) drift.push(`missing check ${constraint.name}`);
    }
    for (const name of live.keys()) if (!codeTables.has(name)) drift.push(`extra table ${name}`);
    check(drift.length === 0, "schema.ts and the database match (tables, columns, nullability, CHECKs)", drift.join("; "));

    // 3. The four columns 0031 adds: present, nullable, right types.
    const receipts = live.get("cash_receipts");
    for (const [name, type] of Object.entries(NEW_COLUMNS)) {
      const column = receipts?.get(name);
      check(Boolean(column && column.nullable && column.type === type), `cash_receipts.${name} is a nullable ${type}`, column ? `${column.type}, nullable=${column.nullable}` : "missing");
    }

    // 4. Existing receipts untouched: still readable, none marked received yet.
    if (receipts?.has("received_at")) {
      const { rows: [{ total, received }] } = await client.query("select count(*)::int as total, count(received_at)::int as received from cash_receipts");
      check(received === 0, "no Cash Receipt is marked received yet", `${total} receipts, ${received} received`);
    }

    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end();
  }
  console.log(failures.length ? `\n${failures.length} check(s) failed.` : "\nAll checks passed. Safe to merge feature/cash-receipt-mark-received and redeploy.");
  process.exitCode = failures.length ? 1 : 0;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
