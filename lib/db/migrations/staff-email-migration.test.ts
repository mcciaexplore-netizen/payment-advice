import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("staff email migration", () => {
  it("adds a single nullable email column to staff_members (recommending_authorities.email already existed since migration 0003)", () => {
    const sql = fs.readFileSync(
      path.join(process.cwd(), "lib/db/migrations/0006_mushy_blue_blade.sql"),
      "utf8",
    );
    expect(sql.trim()).toBe('ALTER TABLE "staff_members" ADD COLUMN "email" text;');
  });

  it("matches the checked-in snapshot", () => {
    const snapshot = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "lib/db/migrations/meta/0006_snapshot.json"),
        "utf8",
      ),
    );
    const staffColumns = snapshot.tables["public.staff_members"].columns;
    expect(staffColumns.email).toEqual({
      name: "email",
      type: "text",
      primaryKey: false,
      notNull: false,
    });
    // recommending_authorities.email predates this migration entirely.
    const authorityColumns = snapshot.tables["public.recommending_authorities"].columns;
    expect(authorityColumns.email).toEqual({
      name: "email",
      type: "text",
      primaryKey: false,
      notNull: false,
    });
  });
});
