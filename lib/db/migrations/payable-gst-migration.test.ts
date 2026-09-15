import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "lib/db/migrations/0021_noisy_multiple_man.sql"),
  "utf8",
);

describe("payable calculator and GST settlement migration... schema migration", () => {
  it("adds only nullable calculator columns to historical payment_advices rows", () => {
    expect(sql).toContain('ADD COLUMN "arrears_amount" numeric(14, 2)');
    expect(sql).toContain('ADD COLUMN "arrears_tds_percent" numeric(5, 2)');
    expect(sql).toContain('ADD COLUMN "current_tds_percent" numeric(5, 2)');
    expect(sql).toContain('ADD COLUMN "payable_amount" numeric(14, 2)');
    expect(sql).not.toMatch(/ADD COLUMN "(?:arrears_amount|arrears_tds_percent|current_tds_percent|payable_amount)"[^;]*NOT NULL/);
    expect(sql).not.toContain("UPDATE payment_advices");
  });

  it("stores GST settlement as one flag and actor/timestamp directly on the advice", () => {
    expect(sql).toContain('ADD COLUMN "gst_settled" boolean DEFAULT false NOT NULL');
    expect(sql).toContain('ADD COLUMN "gst_settled_by" text');
    expect(sql).toContain('ADD COLUMN "gst_settled_at" timestamp with time zone');
    expect(sql).not.toContain('CREATE TABLE "gst_settlements"');
  });
});
