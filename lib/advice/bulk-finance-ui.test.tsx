import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

import { BulkFinanceProvider, BulkRowCheckbox, BulkSelectAll, type BulkRow } from "@/components/admin/BulkFinanceActions";

const row = (n: number, selectable: boolean): BulkRow => ({ id: `id-${n}`, reference: `MCCIA/2026-27/000${n}`, payeeName: `Payee ${n}`, amount: "100.00", paymentMode: "NEFT", isAdvance: false, payableAmount: "100.00", billPassedFor: null, totalPaid: "0", basicAmount: null, gstAmount: null, href: `/admin/advice/id-${n}`, selectable });

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

  it("payment: a row without a saved payable amount shows a Set payable first link, no checkbox, and select-all skips it", () => {
    const rows = [row(1, true), { ...row(3, true), payableAmount: null }];
    const html = renderToStaticMarkup(
      <BulkFinanceProvider action="payment" rows={rows}>
        <div><BulkRowCheckbox id="id-1" /><BulkRowCheckbox id="id-3" /></div>
      </BulkFinanceProvider>,
    );
    expect(html).toContain('aria-label="Select MCCIA/2026-27/0001"');
    expect(html).not.toContain('aria-label="Select MCCIA/2026-27/0003"');
    expect(html).toMatch(/<a href="\/admin\/advice\/id-3"[^>]*title="Payable amount not set\. Open the item to set it\."[^>]*>Set payable first<\/a>/);
  });

  it("the Verified tab has the Needs payable calculation filter and an all-pages count", () => {
    const page = fs.readFileSync(path.join(process.cwd(), "app/admin/submissions/page.tsx"), "utf8");
    expect(page).toContain('needsPayableFilter ? needsPayableCondition() : undefined');
    expect(page).toContain("where(and(baseWhere, buildTabCondition(tab), needsPayableCondition()))");
    expect(page).toContain("need{needsPayableCount === 1 ? \"s\" : \"\"} a payable calculation before payment.");
    expect(page).toContain('{needsPayableFilter ? "Show all Verified" : "Needs payable calculation"}');
  });

  it("bulk copy: GST note, GST not included total, optional UTR, verify reminder; single panel uses the same not-set wording", () => {
    const bulk = fs.readFileSync(path.join(process.cwd(), "components/admin/BulkFinanceActions.tsx"), "utf8");
    expect(bulk).toContain("GST is settled separately, one by one, from each item.");
    expect(bulk).toContain("Total basic being paid (GST not included)");
    expect(bulk).toContain("UTR / Reference (optional)");
    expect(bulk).not.toContain('placeholder="Required"');
    expect(bulk).toContain("NEFT items still need their payable calculation before payment.");
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
