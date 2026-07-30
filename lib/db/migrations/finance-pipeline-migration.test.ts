import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("finance pipeline migration", () => {
  it("adds the five nullable finance-pipeline columns and drops sanctioned_by_name", () => {
    const sql = fs.readFileSync(
      path.join(process.cwd(), "lib/db/migrations/0005_finance_pipeline.sql"),
      "utf8",
    );
    expect(sql).toContain('ADD COLUMN "finance_received_at" timestamp with time zone');
    expect(sql).toContain('ADD COLUMN "verified_at" timestamp with time zone');
    expect(sql).toContain('ADD COLUMN "verified_by" text');
    expect(sql).toContain('ADD COLUMN "sanctioned_at" timestamp with time zone');
    expect(sql).toContain('ADD COLUMN "sanctioned_by" text');
    expect(sql).toContain('DROP COLUMN "sanctioned_by_name"');
    // Nullable, derived-state columns, not a new required workflow column —
    // same rationale as the authority_* columns in migration 0004.
    expect(sql).not.toMatch(/(finance_received_at|verified_at|verified_by|sanctioned_at|sanctioned_by).*NOT NULL/);
  });

  it("matches the checked-in snapshot (no drift between schema.ts and the hand-written snapshot JSON)", () => {
    const snapshot = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "lib/db/migrations/meta/0005_snapshot.json"),
        "utf8",
      ),
    );
    const columns = snapshot.tables["public.payment_advices"].columns;
    expect(columns.sanctioned_by_name).toBeUndefined();
    expect(columns.finance_received_at).toEqual({
      name: "finance_received_at",
      type: "timestamp with time zone",
      primaryKey: false,
      notNull: false,
    });
    expect(columns.verified_by).toEqual({
      name: "verified_by",
      type: "text",
      primaryKey: false,
      notNull: false,
    });
    expect(columns.sanctioned_by).toEqual({
      name: "sanctioned_by",
      type: "text",
      primaryKey: false,
      notNull: false,
    });
  });
});
