import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("advance_particulars simplified to description+amount (dropped category/other_description)", () => {
  it("0012 adds description as nullable first (so backfilling existing rows can't fail a NOT NULL constraint)", () => {
    const sql = fs.readFileSync(
      path.join(process.cwd(), "lib/db/migrations/0012_secret_speed.sql"),
      "utf8",
    );
    expect(sql.trim()).toBe('ALTER TABLE "advance_particulars" ADD COLUMN "description" text;');
  });

  it("0013 sets description NOT NULL and drops category/other_description, only after the backfill", () => {
    const sql = fs.readFileSync(
      path.join(process.cwd(), "lib/db/migrations/0013_military_runaways.sql"),
      "utf8",
    );
    expect(sql).toContain('ALTER TABLE "advance_particulars" ALTER COLUMN "description" SET NOT NULL;');
    expect(sql).toContain('ALTER TABLE "advance_particulars" DROP COLUMN "category";');
    expect(sql).toContain('ALTER TABLE "advance_particulars" DROP COLUMN "other_description";');
  });

  it("matches the checked-in 0013 snapshot: description text notNull, category/other_description gone", () => {
    const snapshot = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "lib/db/migrations/meta/0013_snapshot.json"),
        "utf8",
      ),
    );
    const columns = snapshot.tables["public.advance_particulars"].columns;
    expect(columns.description).toEqual({
      name: "description",
      type: "text",
      primaryKey: false,
      notNull: true,
    });
    expect(columns.category).toBeUndefined();
    expect(columns.other_description).toBeUndefined();
    // amount/sort_order/payment_advice_id are untouched by this migration.
    expect(columns.amount).toEqual({
      name: "amount",
      type: "numeric(14, 2)",
      primaryKey: false,
      notNull: true,
    });
  });
});
