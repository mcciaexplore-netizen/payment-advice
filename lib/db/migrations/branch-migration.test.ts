import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("branch migration", () => {
  it("adds a nullable branch column so historical rows remain valid", () => {
    const sql = fs.readFileSync(path.join(process.cwd(), "lib/db/migrations/0018_swift_grey_gargoyle.sql"), "utf8");
    expect(sql.trim()).toBe('ALTER TABLE "payment_advices" ADD COLUMN "branch" text;');
    expect(sql).not.toContain("NOT NULL");
  });
});
