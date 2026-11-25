/**
 * Read-only check that migration 0032 (refund_request_reviews) is applied
 * exactly as generated: the table, its columns, its CHECKs and foreign keys,
 * and that it is still empty. Every query runs inside a READ ONLY
 * transaction, so this script cannot write even by mistake.
 *
 * Run it after applying 0032 and BEFORE 0033 (it checks 0032's own CHECKs,
 * which 0033 replaces): npx tsx scripts/verify-migration-0032.ts
 * Exit code 0 = all checks passed, 1 = something to look at.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const MIGRATION_TAG = "0032_refund_request_reviews";
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
    check(Number(latest?.created_at) === entry.when, "0032 is the newest recorded migration", `db created_at ${latest?.created_at}, journal when ${entry.when}, id ${latest?.id}`);
    check(latest?.hash === fileHash, "recorded hash matches 0032_refund_request_reviews.sql");

    // 2. The table and its columns.
    const { rows: columns } = await client.query("select column_name, is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'refund_request_reviews'");
    const nullable = new Map(columns.map((row) => [row.column_name as string, row.is_nullable === "YES"]));
    const expected: Array<[string, boolean]> = [["refund_request_id", false], ["decision", false], ["decided_by_name", false], ["decided_by_authority_id", true], ["decided_at", false], ["remarks", true]];
    for (const [name, isNullable] of expected) check(nullable.get(name) === isNullable, `column ${name} (${isNullable ? "nullable" : "not null"})`);
    check(columns.length === expected.length, "no extra columns", `${columns.length} columns`);

    // 3. Its constraints.
    const { rows: constraints } = await client.query("select conname from pg_constraint where conrelid = 'public.refund_request_reviews'::regclass");
    const names = new Set(constraints.map((row) => row.conname as string));
    for (const name of [
      "refund_request_reviews_pkey",
      "refund_request_reviews_decision_check",
      "refund_request_reviews_sent_back_remarks_check",
      "refund_request_reviews_refund_request_id_refund_requests_id_fk",
      "refund_request_reviews_decided_by_authority_id_recommending_authorities_id_fk",
    ]) check(names.has(name), `constraint ${name}`);

    // 4. Nothing written yet (the recommendation flag must still be off).
    const { rows: [{ n }] } = await client.query("select count(*)::int as n from refund_request_reviews");
    check(n === 0, "refund_request_reviews is empty", `${n} rows`);

    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end();
  }
  console.log(failures.length ? `\n${failures.length} check(s) failed.` : "\nAll checks passed. Next: apply 0033, then run scripts/verify-migration-0033.ts.");
  process.exitCode = failures.length ? 1 : 0;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
