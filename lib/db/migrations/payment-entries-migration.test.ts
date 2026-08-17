import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("payment_entries + basic/gst/total_paid migration", () => {
  it("matches the checked-in snapshot", () => {
    const snapshot = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "lib/db/migrations/meta/0010_snapshot.json"),
        "utf8",
      ),
    );

    const paymentAdvicesColumns = snapshot.tables["public.payment_advices"].columns;
    // Nullable — old NEFT rows only ever had `amount`, no Basic/GST split.
    expect(paymentAdvicesColumns.basic_amount).toEqual({
      name: "basic_amount",
      type: "numeric(14, 2)",
      primaryKey: false,
      notNull: false,
    });
    expect(paymentAdvicesColumns.gst_amount).toEqual({
      name: "gst_amount",
      type: "numeric(14, 2)",
      primaryKey: false,
      notNull: false,
    });
    // Not null, defaults to 0 — every existing row backfills to "0" with no
    // explicit UPDATE needed.
    expect(paymentAdvicesColumns.total_paid).toEqual({
      name: "total_paid",
      type: "numeric(14, 2)",
      primaryKey: false,
      notNull: true,
      default: "'0'",
    });

    const paymentEntriesTable = snapshot.tables["public.payment_entries"];
    expect(paymentEntriesTable).toBeDefined();
    expect(paymentEntriesTable.columns.amount).toEqual({
      name: "amount",
      type: "numeric(14, 2)",
      primaryKey: false,
      notNull: true,
    });
    expect(paymentEntriesTable.columns.remarks).toEqual({
      name: "remarks",
      type: "text",
      primaryKey: false,
      notNull: true,
    });
    expect(paymentEntriesTable.columns.paid_by).toEqual({
      name: "paid_by",
      type: "text",
      primaryKey: false,
      notNull: true,
    });
  });
});
