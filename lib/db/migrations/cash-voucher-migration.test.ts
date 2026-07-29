import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("cash voucher migration", () => {
  it("creates item rows with a cascading advice foreign key and makes sanctioning optional", () => {
    const sql = fs.readFileSync(
      path.join(process.cwd(), "lib/db/migrations/0002_nostalgic_carnage.sql"),
      "utf8",
    );
    expect(sql).toContain('CREATE TABLE "cash_voucher_items"');
    expect(sql).toContain('"payment_advice_id" uuid NOT NULL');
    expect(sql).toContain("ON DELETE cascade");
    expect(sql).toContain('ALTER COLUMN "sanctioned_by_name" DROP NOT NULL');
  });
});
