import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("advance payment migration (is_advance, advance_no, advance_particulars)", () => {
  it("matches the checked-in snapshot", () => {
    const snapshot = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "lib/db/migrations/meta/0011_snapshot.json"),
        "utf8",
      ),
    );

    const columns = snapshot.tables["public.payment_advices"].columns;
    expect(columns.is_advance).toEqual({
      name: "is_advance",
      type: "boolean",
      primaryKey: false,
      notNull: true,
      default: false,
    });
    expect(columns.advance_no).toEqual({
      name: "advance_no",
      type: "text",
      primaryKey: false,
      notNull: false,
    });
    expect(columns.purpose_of_advance).toEqual({
      name: "purpose_of_advance",
      type: "text",
      primaryKey: false,
      notNull: false,
    });
    expect(columns.previous_pending_advance_amount).toEqual({
      name: "previous_pending_advance_amount",
      type: "numeric(14, 2)",
      primaryKey: false,
      notNull: false,
    });
    expect(columns.previous_pending_advance_since).toEqual({
      name: "previous_pending_advance_since",
      type: "date",
      primaryKey: false,
      notNull: false,
    });

    const particularsTable = snapshot.tables["public.advance_particulars"];
    expect(particularsTable).toBeDefined();
    expect(particularsTable.columns.category).toEqual({
      name: "category",
      type: "text",
      primaryKey: false,
      notNull: true,
    });
    expect(particularsTable.columns.other_description).toEqual({
      name: "other_description",
      type: "text",
      primaryKey: false,
      notNull: false,
    });
    expect(particularsTable.columns.amount).toEqual({
      name: "amount",
      type: "numeric(14, 2)",
      primaryKey: false,
      notNull: true,
    });
  });
});
