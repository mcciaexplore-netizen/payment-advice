import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(path.join(process.cwd(), "lib/db/migrations/0030_refund_requests.sql"), "utf8");
const statements = sql.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean);

describe("refund requests migration (0030)", () => {
  it("is purely additive: one new table, one new nullable audit_log column, and its FK", () => {
    expect(statements).toHaveLength(3);
    expect(statements[0]).toMatch(/^CREATE TABLE "refund_requests"/);
    expect(statements[1]).toBe('ALTER TABLE "audit_log" ADD COLUMN "refund_request_id" uuid;');
    expect(statements[2]).toContain('FOREIGN KEY ("refund_request_id") REFERENCES "public"."refund_requests"("id")');
    for (const statement of statements) expect(statement).toMatch(/^(CREATE TABLE|ALTER TABLE "audit_log" ADD )/);
    expect(sql).not.toMatch(/\b(DROP|INSERT INTO|GRANT|RENAME)\b/i);
    expect(sql).not.toContain("refund_submissions");
  });

  it("enforces the unique serial and the field constraints in the database", () => {
    for (const constraint of [
      'CONSTRAINT "refund_requests_serial_no_unique" UNIQUE("serial_no")',
      "refund_requests_branch_check",
      "refund_requests_total_positive_check",
      "refund_requests_total_matches_check",
      "refund_requests_from_date_check",
      "refund_requests_bank_ifsc_check",
      "refund_requests_payee_gstin_check",
      "refund_requests_documents_array_check",
    ]) expect(sql).toContain(constraint);
  });
});
