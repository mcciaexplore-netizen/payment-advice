import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("payment_advices.bank_details_mismatch migration", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "lib/db/migrations/0024_overconfident_millenium_guard.sql"),
    "utf8",
  );

  it("adds bank_details_mismatch as a non-nullable boolean defaulting to false — safe for every existing row", () => {
    expect(sql).toContain(
      'ALTER TABLE "payment_advices" ADD COLUMN "bank_details_mismatch" boolean DEFAULT false NOT NULL',
    );
  });
});
