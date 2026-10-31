import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

import { BulkFinanceProvider, BulkRowCheckbox, BulkSelectAll, type BulkRow } from "@/components/admin/BulkFinanceActions";

const row = (n: number, selectable: boolean): BulkRow => ({ id: `id-${n}`, reference: `MCCIA/2026-27/000${n}`, payeeName: `Payee ${n}`, amount: "100.00", paymentMode: "NEFT", isAdvance: false, payableAmount: "100.00", billPassedFor: null, totalPaid: "0", basicAmount: "100.00", gstAmount: null, href: `/admin/advice/id-${n}`, selectable });

describe("bulk selection UI", () => {
  it("shows a checkbox only on rows the user may act on, a select-all, and no bar until something is selected", () => {
    const rows = [row(1, true), row(2, false)];
    const html = renderToStaticMarkup(
      <BulkFinanceProvider action="payment" rows={rows}>
        <div><BulkSelectAll /><BulkRowCheckbox id="id-1" /><BulkRowCheckbox id="id-2" /></div>
      </BulkFinanceProvider>,
    );
    expect(html).toContain('aria-label="Select all on this page"');
    expect(html).toContain('aria-label="Select MCCIA/2026-27/0001"');
    expect(html).not.toContain('aria-label="Select MCCIA/2026-27/0002"');
    expect(html).not.toContain("selected,");
  });

  it("payment: rows without a saved payable (NEFT with Basic, Cash Voucher without Bill passed for) are selectable; only a row bulk cannot pay gets the Set payable first link", () => {
    const rows = [
      row(1, true),
      { ...row(3, true), payableAmount: null, basicAmount: "90.00" },
      { ...row(4, true), paymentMode: "CASH" as const, payableAmount: null, billPassedFor: null },
      { ...row(5, true), payableAmount: null, basicAmount: null },
      { ...row(6, true), paymentMode: "CASH" as const, isAdvance: true, payableAmount: null },
    ];
    const html = renderToStaticMarkup(
      <BulkFinanceProvider action="payment" rows={rows}>
        <div>{rows.map((r) => <BulkRowCheckbox key={r.id} id={r.id} />)}</div>
      </BulkFinanceProvider>,
    );
    for (const n of [1, 3, 4]) expect(html).toContain(`aria-label="Select MCCIA/2026-27/000${n}"`);
    for (const n of [5, 6]) {
      expect(html).not.toContain(`aria-label="Select MCCIA/2026-27/000${n}"`);
      expect(html).toMatch(new RegExp(`<a href="/admin/advice/id-${n}"[^>]*title="Payable amount not set\\. Open the item to set it\\."[^>]*>Set payable first</a>`));
    }
  });

  it("the Verified tab has the Needs payable calculation filter and an all-pages count", () => {
    const page = fs.readFileSync(path.join(process.cwd(), "app/admin/submissions/page.tsx"), "utf8");
    expect(page).toContain('needsPayableFilter ? needsPayableCondition() : undefined');
    expect(page).toContain("where(and(baseWhere, buildTabCondition(tab), needsPayableCondition()))");
    expect(page).toContain("no payable calculation. Bulk payment will use the Basic amount with no deductions.");
    expect(page).not.toContain("a payable calculation before payment.");
    expect(page).toContain('{needsPayableFilter ? "Show all Verified" : "Needs payable calculation"}');
  });

  it("bulk copy: GST note, GST not included total, optional UTR, Basic used when not set, confirm line; single panel unchanged", () => {
    const bulk = fs.readFileSync(path.join(process.cwd(), "components/admin/BulkFinanceActions.tsx"), "utf8");
    expect(bulk).toContain("GST is settled separately, one by one, from each item.");
    expect(bulk).toContain("Total basic being paid (GST not included)");
    expect(bulk).toContain("UTR / Reference (optional)");
    expect(bulk).not.toContain('placeholder="Required"');
    expect(bulk).toContain("NEFT items without a payable calculation will be paid on Basic with no deductions in bulk payment.");
    expect(bulk).toContain("will be used</span>");
    expect(bulk).toContain('no payable calculation, paid on Basic with no deductions (no TDS)');
    const single = fs.readFileSync(path.join(process.cwd(), "components/admin/AdviceActions.tsx"), "utf8");
    expect(single).toContain("Payable amount not set. Save the payable calculation above before recording a payment.");
    expect(single).toContain("Basic amount: ₹ {formatMoney(basicAmount ?? \"0\")} · GST amount: ₹ {formatMoney(gstAmount ?? \"0\")}");
  });

  it("the Submissions page offers bulk only on the three action tabs, and keeps every column", () => {
    const page = fs.readFileSync(path.join(process.cwd(), "app/admin/submissions/page.tsx"), "utf8");
    expect(page).toContain("const bulkAction = bulkActionForTab(tab);");
    expect(page).toContain("selectable: bulkAction !== \"payment\" || ownsSubmissionType(session.roles");
    expect(page).toContain("+ (bulkAction ? 1 : 0)");
  });

  it("no em dashes in the bulk UI copy", () => {
    expect(fs.readFileSync(path.join(process.cwd(), "components/admin/BulkFinanceActions.tsx"), "utf8")).not.toContain("\u2014");
  });
});
