import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("authority workflow migration", () => {
  it("adds the four nullable authority columns plus a unique authority_token", () => {
    const sql = fs.readFileSync(
      path.join(process.cwd(), "lib/db/migrations/0004_giant_starjammers.sql"),
      "utf8",
    );
    expect(sql).toContain('ADD COLUMN "authority_approved_at" timestamp with time zone');
    expect(sql).toContain('ADD COLUMN "authority_rejected_at" timestamp with time zone');
    expect(sql).toContain('ADD COLUMN "authority_remarks" text');
    expect(sql).toContain('ADD COLUMN "authority_token" text');
    expect(sql).toContain('ADD COLUMN "authority_token_expires_at" timestamp with time zone');
    expect(sql).toContain('CONSTRAINT "payment_advices_authority_token_unique" UNIQUE("authority_token")');
    // No status enum change and no NOT NULL — these are all nullable, derived-state
    // columns, not a new required workflow column that could break existing rows.
    expect(sql).not.toMatch(/authority_\w+.*NOT NULL/);
  });
});
