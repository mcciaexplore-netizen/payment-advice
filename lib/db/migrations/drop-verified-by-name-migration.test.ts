import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("drop verified_by_name migration", () => {
  it("drops the submitter-filled verified_by_name column from payment_advices", () => {
    const sql = fs.readFileSync(
      path.join(process.cwd(), "lib/db/migrations/0007_drop_verified_by_name.sql"),
      "utf8",
    );
    expect(sql.trim()).toBe('ALTER TABLE "payment_advices" DROP COLUMN "verified_by_name";');
  });

  it("matches the checked-in snapshot", () => {
    const snapshot = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "lib/db/migrations/meta/0007_snapshot.json"),
        "utf8",
      ),
    );
    const columns = snapshot.tables["public.payment_advices"].columns;
    expect(columns.verified_by_name).toBeUndefined();
    // verified_by (admin-recorded, Finance pipeline) is unrelated and untouched.
    expect(columns.verified_by).toEqual({
      name: "verified_by",
      type: "text",
      primaryKey: false,
      notNull: false,
    });
  });
});
