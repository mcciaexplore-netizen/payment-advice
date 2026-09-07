import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Cash Voucher expense detail migration", () => {
  it("adds nullable bill fields and a nullable attachment foreign key", () => {
    const sql = fs.readFileSync(path.join(process.cwd(), "lib/db/migrations/0017_daily_ezekiel_stane.sql"), "utf8");
    expect(sql).toContain('ADD COLUMN "bill_no" text');
    expect(sql).toContain('ADD COLUMN "bill_date" date');
    expect(sql).toContain('ADD COLUMN "attachment_id" uuid');
    expect(sql).toContain('REFERENCES "public"."attachments"("id") ON DELETE set null');
    expect(sql).not.toMatch(/bill_(?:no|date)"[^;]*NOT NULL/);
    expect(sql).not.toMatch(/attachment_id"[^;]*NOT NULL/);
  });
});
