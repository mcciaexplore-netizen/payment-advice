import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(path.join(process.cwd(), "lib/db/migrations/0032_refund_request_reviews.sql"), "utf8");
const statements = sql.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean);

describe("refund request reviews migration (0032)", () => {
  it("is purely additive: one new table and its two foreign keys, nothing existing is altered", () => {
    expect(statements).toHaveLength(3);
    expect(statements[0]).toMatch(/^CREATE TABLE "refund_request_reviews"/);
    expect(statements[1]).toContain('FOREIGN KEY ("refund_request_id") REFERENCES "public"."refund_requests"("id")');
    expect(statements[2]).toContain('FOREIGN KEY ("decided_by_authority_id") REFERENCES "public"."recommending_authorities"("id")');
    // Both ALTERs only add a constraint to the NEW table: refund_requests itself never changes shape.
    for (const statement of statements.slice(1)) expect(statement).toMatch(/^ALTER TABLE "refund_request_reviews" ADD CONSTRAINT/);
    expect(sql).not.toMatch(/\b(DROP|INSERT INTO|GRANT|RENAME)\b/i);
    // (The foreign keys legitimately say "ON UPDATE NO ACTION", so check statement types, not words.)
    for (const statement of statements) expect(statement).not.toMatch(/^(UPDATE|DELETE|INSERT|DROP)/i);
    expect(sql).not.toMatch(/ALTER TABLE "(refund_requests|audit_log|payment_advices)"/);
  });

  it("allows one decision per refund, only the two decisions, and requires remarks when sending back", () => {
    expect(statements[0]).toContain('"refund_request_id" uuid PRIMARY KEY NOT NULL');
    expect(statements[0]).toContain("\"decision\" in ('RECOMMENDED', 'SENT_BACK')");
    expect(statements[0]).toMatch(/"decision" <> 'SENT_BACK' or \("refund_request_reviews"\."remarks" is not null and length\(btrim\("refund_request_reviews"\."remarks"\)\) > 0\)/);
    expect(statements[0]).toContain('"decided_by_name" text NOT NULL');
    expect(statements[0]).toContain('"decided_at" timestamp with time zone DEFAULT now() NOT NULL');
  });

  it("is registered in the migration journal right after 0031", () => {
    const journal = JSON.parse(fs.readFileSync(path.join(process.cwd(), "lib/db/migrations/meta/_journal.json"), "utf8"));
    const tags = journal.entries.map((entry: { tag: string }) => entry.tag);
    expect(tags.at(-1)).toBe("0032_refund_request_reviews");
    expect(tags.at(-2)).toBe("0031_cash_receipt_received");
  });
});
