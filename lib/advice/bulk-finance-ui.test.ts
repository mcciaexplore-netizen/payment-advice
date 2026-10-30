import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

import { BulkFinanceProvider, BulkRowCheckbox, BulkSelectAll, type BulkRow } from "@/components/admin/BulkFinanceActions";

const row = (n: number, selectable: boolean): BulkRow => ({ id: `id-${n}`, reference: `MCCIA/2026-27/000${n}`, payeeName: `Payee ${n}`, amount: "100.00", paymentMode: "NEFT", isAdvance: false, payableAmount: "100.00", billPassedFor: null, totalPaid: "0", selectable });

describe("bulk selection UI", () => {
  it("shows a checkbox only on rows the user may act on, a select-all, and no bar until something is selected", () => {
    const rows = [row(1, true), row(2, false)];
    const html = renderToStaticMarkup(createElement(BulkFinanceProvider, { action: "payment", rows, children: createElement("div", null, createElement(BulkSelectAll), createElement(BulkRowCheckbox, { id: "id-1" }), createElement(BulkRowCheckbox, { id: "id-2" })) }));
    expect(html).toContain('aria-label="Select all on this page"');
    expect(html).toContain('aria-label="Select MCCIA/2026-27/0001"');
    expect(html).not.toContain('aria-label="Select MCCIA/2026-27/0002"');
    expect(html).not.toContain("selected,");
  });

  it("the Submissions page offers bulk only on the three action tabs, and keeps every column", () => {
    const page = fs.readFileSync(path.join(process.cwd(), "app/admin/submissions/page.tsx"), "utf8");
    expect(page).toContain("const bulkAction = bulkActionForTab(tab);");
    expect(page).toContain("selectable: bulkAction !== \"payment\" || ownsSubmissionType(session.roles");
    expect(page).toContain("+ (bulkAction ? 1 : 0)");
  });

  it("no em dashes in the bulk UI copy", () => {
    expect(fs.readFileSync(path.join(process.cwd(), "components/admin/BulkFinanceActions.tsx"), "utf8")).not.toContain("—");
  });
});
