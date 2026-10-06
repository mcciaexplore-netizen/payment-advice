import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Cash Receipts migration", () => {
  const sql = fs.readFileSync(path.join(process.cwd(), "lib/db/migrations/0028_youthful_mordo.sql"), "utf8");

  it("creates the cash_receipts table with a unique serial_no and positive-total check", () => {
    expect(sql).toContain('CREATE TABLE "cash_receipts"');
    expect(sql).toContain('"serial_no" text NOT NULL');
    expect(sql).toContain("cash_receipts_serial_no_unique");
    expect(sql).toContain("cash_receipts_total_positive_check");
    expect(sql).toContain('"cash_receipts"."total" > 0');
  });

  it("constrains branch to the five known offices", () => {
    expect(sql).toContain("cash_receipts_branch_check");
    expect(sql).toContain("'SB Road Office', 'Tilak Road Office', 'Hadapsar Office', 'Bhosari Office', 'Ahilyanagar Office'");
  });

  it("adds a nullable cash_receipt_id FK to audit_log, same pattern as forwarding_memo_id", () => {
    expect(sql).toContain('ALTER TABLE "audit_log" ADD COLUMN "cash_receipt_id" uuid');
    expect(sql).toContain("audit_log_cash_receipt_id_cash_receipts_id_fk");
  });

  it("touches only cash_receipts and audit_log — no existing table altered or dropped", () => {
    expect(sql).not.toMatch(/DROP (TABLE|COLUMN)/i);
    expect(sql).not.toContain('ALTER TABLE "payment_advices"');
    expect(sql).not.toContain('ALTER TABLE "serial_counters"');
    const alteredTables = [...sql.matchAll(/ALTER TABLE "(\w+)"/g)].map((m) => m[1]);
    expect(new Set(alteredTables)).toEqual(new Set(["audit_log"]));
    const createdTables = [...sql.matchAll(/CREATE TABLE "(\w+)"/g)].map((m) => m[1]);
    expect(createdTables).toEqual(["cash_receipts"]);
  });
});
