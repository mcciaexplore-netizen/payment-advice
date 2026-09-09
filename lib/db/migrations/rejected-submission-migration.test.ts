import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("0020 rejected submission migration", () => {
  const sql = fs.readFileSync(path.join(process.cwd(), "lib/db/migrations/0020_shiny_iron_lad.sql"), "utf8");
  it("adds nullable audit fields without altering or deleting serial fields", () => {
    expect(sql).toContain('ADD COLUMN "rejected_at" timestamp with time zone');
    expect(sql).toContain('ADD COLUMN "rejected_by" text');
    expect(sql).toContain('ADD COLUMN "rejection_remarks" text');
    expect(sql).not.toMatch(/drop|serial_no|serial_counters/i);
  });
});
