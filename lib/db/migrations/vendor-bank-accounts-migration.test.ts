import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("vendor_bank_accounts migration", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "lib/db/migrations/0021_illegal_legion.sql"),
    "utf8",
  );

  it("creates the table with required bank-detail columns", () => {
    expect(sql).toContain('CREATE TABLE "vendor_bank_accounts"');
    expect(sql).toContain('"bank_account_no" text NOT NULL');
    expect(sql).toContain('"bank_ifsc" text NOT NULL');
    expect(sql).toContain('"beneficiary_name" text NOT NULL');
  });

  it("deduplicates on (vendor_id, bank_account_no, bank_ifsc)", () => {
    expect(sql).toContain(
      'CONSTRAINT "vendor_bank_accounts_vendor_id_bank_account_no_bank_ifsc_unique" UNIQUE("vendor_id","bank_account_no","bank_ifsc")',
    );
  });

  it("keeps source_advice_id as traceability only, not a hard requirement", () => {
    expect(sql).toContain('"source_advice_id" uuid,');
    expect(sql).not.toContain('"source_advice_id" uuid NOT NULL');
  });

  it("references vendors and payment_advices", () => {
    expect(sql).toContain('REFERENCES "public"."vendors"("id")');
    expect(sql).toContain('REFERENCES "public"."payment_advices"("id")');
  });
});
