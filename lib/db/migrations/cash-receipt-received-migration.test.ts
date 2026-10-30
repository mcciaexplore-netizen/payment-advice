import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(path.join(process.cwd(), "lib/db/migrations/0031_cash_receipt_received.sql"), "utf8");
const statements = sql.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean);

describe("cash receipt received migration (0031)", () => {
  it("is purely additive: exactly four nullable columns on cash_receipts, nothing else", () => {
    expect(statements).toEqual([
      'ALTER TABLE "cash_receipts" ADD COLUMN "received_at" timestamp with time zone;',
      'ALTER TABLE "cash_receipts" ADD COLUMN "received_by" text;',
      'ALTER TABLE "cash_receipts" ADD COLUMN "received_note" text;',
      'ALTER TABLE "cash_receipts" ADD COLUMN "received_email_sent_at" timestamp with time zone;',
    ]);
    expect(sql).not.toMatch(/NOT NULL|DEFAULT|DROP|INSERT|UPDATE|audit_log/i);
  });
});
