import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(path.join(process.cwd(), "lib/db/migrations/0033_refund_review_reject.sql"), "utf8");
const statements = sql.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean);

describe("refund review reject migration (0033)", () => {
  it("only replaces the two CHECK constraints on refund_request_reviews; no other table, column or data changes", () => {
    expect(statements).toEqual([
      'ALTER TABLE "refund_request_reviews" DROP CONSTRAINT "refund_request_reviews_sent_back_remarks_check";',
      'ALTER TABLE "refund_request_reviews" DROP CONSTRAINT "refund_request_reviews_decision_check";',
      expect.stringMatching(/^ALTER TABLE "refund_request_reviews" ADD CONSTRAINT "refund_request_reviews_reason_check" CHECK /),
      expect.stringMatching(/^ALTER TABLE "refund_request_reviews" ADD CONSTRAINT "refund_request_reviews_decision_check" CHECK /),
    ]);
    expect(sql).not.toMatch(/\b(INSERT INTO|UPDATE "|DELETE FROM|GRANT|RENAME|ADD COLUMN|DROP COLUMN|DROP TABLE|CREATE TABLE)\b/i);
  });

  it("allows RECOMMENDED, SENT_BACK and REJECTED, and requires a non-blank reason for SENT_BACK and REJECTED", () => {
    expect(statements[3]).toContain("\"decision\" in ('RECOMMENDED', 'SENT_BACK', 'REJECTED')");
    expect(statements[2]).toContain("\"decision\" = 'RECOMMENDED' or (\"refund_request_reviews\".\"remarks\" is not null and length(btrim(\"refund_request_reviews\".\"remarks\")) > 0)");
  });

  it("is registered right after 0032, which is unchanged", () => {
    const journal = JSON.parse(fs.readFileSync(path.join(process.cwd(), "lib/db/migrations/meta/_journal.json"), "utf8"));
    const tags = journal.entries.map((entry: { tag: string }) => entry.tag);
    expect(tags.at(-1)).toBe("0033_refund_review_reject");
    expect(tags.at(-2)).toBe("0032_refund_request_reviews");
  });
});
