import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Team Dashboard scoped-role migration", () => {
  it("adds nullable scope_value and enforces scoped/non-scoped role consistency", () => {
    const sql = fs.readFileSync(path.join(process.cwd(), "lib/db/migrations/0019_thankful_blockbuster.sql"), "utf8");
    expect(sql).toContain('ADD COLUMN "scope_value" text');
    expect(sql).toContain("role\" in ('BRANCH', 'DEPARTMENT')");
    expect(sql).toContain('"scope_value" is not null');
    expect(sql).toContain("role\" not in ('BRANCH', 'DEPARTMENT')");
    expect(sql).toContain('"scope_value" is null');
  });
});
