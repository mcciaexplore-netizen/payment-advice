import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("authority login migration", () => {
  it("links admin_users to recommending_authorities without changing the token workflow columns", () => {
    const sql = fs.readFileSync(path.join(process.cwd(), "lib/db/migrations/0014_easy_magdalene.sql"), "utf8");
    expect(sql).toContain('ADD COLUMN "recommending_authority_id" uuid');
    expect(sql).toContain('REFERENCES "public"."recommending_authorities"("id")');
    expect(sql).not.toContain("authority_token");
  });
});
