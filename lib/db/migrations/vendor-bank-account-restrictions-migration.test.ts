import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("vendor_bank_accounts.restricted_to_emails migration", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "lib/db/migrations/0022_careful_venus.sql"),
    "utf8",
  );

  it("adds restricted_to_emails as a nullable text array (no default needed — NULL is the unrestricted default)", () => {
    expect(sql).toContain('ALTER TABLE "vendor_bank_accounts" ADD COLUMN "restricted_to_emails" text[]');
    expect(sql).not.toContain("NOT NULL");
    expect(sql).not.toContain("DEFAULT");
  });
});
