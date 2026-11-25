/**
 * Read-only check that migration 0033 (refund review: Reject, reason rule) is
 * applied exactly as generated. Every query runs inside a READ ONLY
 * transaction, so this script cannot write even by mistake; the rules are
 * checked from the constraint definitions, not by trying inserts.
 *
 * Usage (after `npm run db:migrate`): npx tsx scripts/verify-migration-0033.ts
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

const MIGRATION_TAG = "0033_refund_review_reject";
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
    check(Number(latest?.created_at) === entry.when, "0033 is the newest recorded migration", `db created_at ${latest?.created_at}, journal when ${entry.when}, id ${latest?.id}`);
    check(latest?.hash === fileHash, "recorded hash matches 0033_refund_review_reject.sql");

    // 2. The constraints on refund_request_reviews, read from the catalog.
    const { rows: constraints } = await client.query(
      "select conname, pg_get_constraintdef(oid) def from pg_constraint where conrelid = 'public.refund_request_reviews'::regclass and contype = 'c'",
    );
    const def = (name: string) => constraints.find((row) => row.conname === name)?.def as string | undefined;
    const decision = def("refund_request_reviews_decision_check");
    check(Boolean(decision), "decision check exists");
    for (const value of ["RECOMMENDED", "SENT_BACK", "REJECTED"]) check(Boolean(decision?.includes(`'${value}'`)), `decision check allows ${value}`, decision ?? "missing");
    const reason = def("refund_request_reviews_reason_check");
    check(Boolean(reason), "reason check exists", reason ?? "missing");
    check(Boolean(reason && /decision = 'RECOMMENDED'/.test(reason) && /remarks IS NOT NULL/i.test(reason) && /btrim\(remarks\)/i.test(reason)), "reason check: only RECOMMENDED may have no reason (SENT_BACK and REJECTED need a non-blank one)", reason ?? "missing");
    check(!def("refund_request_reviews_sent_back_remarks_check"), "old sent_back_remarks_check is gone");

    // 3. Every existing review row already satisfies the new rules.
    const { rows: [{ bad }] } = await client.query(
      "select count(*)::int bad from refund_request_reviews where decision not in ('RECOMMENDED','SENT_BACK','REJECTED') or (decision <> 'RECOMMENDED' and (remarks is null or length(btrim(remarks)) = 0))",
    );
    check(bad === 0, "existing review rows satisfy the new rules", `${bad} rows`);

    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end();
  }
  console.log(failures.length ? `\n${failures.length} check(s) failed.` : "\nAll checks passed. Safe to merge feature/refund-authority-sendback-reject (flag still off).");
  process.exitCode = failures.length ? 1 : 0;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
