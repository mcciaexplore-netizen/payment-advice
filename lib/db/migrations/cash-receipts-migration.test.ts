import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Cash Receipts migration", () => {
  const sql = fs.readFileSync(path.join(process.cwd(), "lib/db/migrations/0028_curvy_callisto.sql"), "utf8");

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

  it("requires a real issued_by_user_id, FK'd to admin_users - not a free-text name", () => {
    expect(sql).toContain('"issued_by_user_id" uuid NOT NULL');
    expect(sql).toContain("cash_receipts_issued_by_user_id_admin_users_id_fk");
    expect(sql).toContain('REFERENCES "public"."admin_users"("id")');
  });

  it("adds a nullable cash_receipt_id FK to audit_log, same pattern as forwarding_memo_id", () => {
    expect(sql).toContain('ALTER TABLE "audit_log" ADD COLUMN "cash_receipt_id" uuid');
    expect(sql).toContain("audit_log_cash_receipt_id_cash_receipts_id_fk");
  });

  it("touches only the new cash_receipts table and audit_log - no other existing table altered or dropped", () => {
    expect(sql).not.toMatch(/DROP (TABLE|COLUMN)/i);
    expect(sql).not.toContain('ALTER TABLE "payment_advices"');
    expect(sql).not.toContain('ALTER TABLE "serial_counters"');
    expect(sql).not.toContain('ALTER TABLE "admin_users"');
    const alteredTables = [...sql.matchAll(/ALTER TABLE "(\w+)"/g)].map((m) => m[1]);
    // cash_receipts is altered only to add its own FK constraint right
    // after being created in this same migration - not an existing table
    // being changed.
    expect(new Set(alteredTables)).toEqual(new Set(["audit_log", "cash_receipts"]));
    const createdTables = [...sql.matchAll(/CREATE TABLE "(\w+)"/g)].map((m) => m[1]);
    expect(createdTables).toEqual(["cash_receipts"]);
  });
});
