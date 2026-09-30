import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type SnapshotTable = {
  columns: Record<string, { type: string; notNull: boolean }>;
  foreignKeys: Record<string, {
    tableTo: string;
    columnsFrom: string[];
    columnsTo: string[];
    onDelete: string;
    onUpdate: string;
  }>;
};
type Snapshot = {
  id: string;
  prevId: string;
  tables: Record<string, SnapshotTable>;
};

const migrationsDir = path.join(process.cwd(), "lib/db/migrations");
const migrationSql = fs.readFileSync(path.join(migrationsDir, "0025_forwarding_memos.sql"), "utf8");
const previous: Snapshot = JSON.parse(fs.readFileSync(path.join(migrationsDir, "meta/0024_snapshot.json"), "utf8"));
const current: Snapshot = JSON.parse(fs.readFileSync(path.join(migrationsDir, "meta/0025_snapshot.json"), "utf8"));

describe("Forwarding Memo migration safety", () => {
  it("only creates the memo table and adds its nullable audit association", () => {
    const statements = migrationSql.replaceAll("--> statement-breakpoint", "")
      .split(";").map((statement) => statement.trim()).filter(Boolean);

    expect(statements).toHaveLength(3);
    expect(statements[0]).toMatch(/^CREATE TABLE "forwarding_memos" \([\s\S]+\)$/);
    expect(statements[1]).toBe('ALTER TABLE "audit_log" ADD COLUMN "forwarding_memo_id" uuid');
    expect(statements[2]).toBe('ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_forwarding_memo_id_forwarding_memos_id_fk" FOREIGN KEY ("forwarding_memo_id") REFERENCES "public"."forwarding_memos"("id") ON DELETE no action ON UPDATE no action');
    expect(migrationSql).not.toMatch(/\b(?:INSERT\s+INTO|UPDATE\s+"|DELETE\s+FROM|DROP\s+|TRUNCATE\s+|RENAME\s+)\b/i);
  });

  it("preserves every existing table, including payment data and counters", () => {
    expect(Object.keys(current.tables).filter((name) => !(name in previous.tables))).toEqual(["public.forwarding_memos"]);
    for (const [name, table] of Object.entries(previous.tables)) {
      if (name === "public.audit_log") continue;
      expect(current.tables[name], name).toEqual(table);
    }

    const auditWithoutMemo = structuredClone(current.tables["public.audit_log"]);
    delete auditWithoutMemo.columns.forwarding_memo_id;
    delete auditWithoutMemo.foreignKeys.audit_log_forwarding_memo_id_forwarding_memos_id_fk;
    expect(auditWithoutMemo).toEqual(previous.tables["public.audit_log"]);
  });

  it("retains instrument identifiers as text and enforces the approved modes and positive amount", () => {
    const memo = current.tables["public.forwarding_memos"];
    expect(memo.columns.instrument_no).toMatchObject({ type: "text", notNull: true });
    expect(memo.columns.amount).toMatchObject({ type: "numeric(14, 2)", notNull: true });
    expect(migrationSql).toContain('CHECK ("forwarding_memos"."instrument_mode" in (\'CHEQUE\', \'DD\'))');
    expect(migrationSql).toContain('CHECK ("forwarding_memos"."amount" > 0)');
    expect(memo.foreignKeys).toEqual({});
  });

  it("links audit entries without invalidating historical rows or cascading deletes", () => {
    const audit = current.tables["public.audit_log"];
    expect(audit.columns.forwarding_memo_id).toMatchObject({ type: "uuid", notNull: false });
    expect(audit.foreignKeys.audit_log_forwarding_memo_id_forwarding_memos_id_fk).toMatchObject({
      tableTo: "forwarding_memos",
      columnsFrom: ["forwarding_memo_id"],
      columnsTo: ["id"],
      onDelete: "no action",
      onUpdate: "no action",
    });
    expect(current.prevId).toBe(previous.id);
  });
});
