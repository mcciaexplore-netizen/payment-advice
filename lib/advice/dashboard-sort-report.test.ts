import ExcelJS from "exceljs";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { dashboardOrderBy, hasActiveFilters, parseDashboardFilters, SORTS } from "@/lib/advice/dashboard-filters";
import { buildDashboardReport, type DashboardReportRow } from "@/lib/advice/dashboard-report";
import { DashboardFilters } from "@/components/dashboard/DashboardFilters";

const sqlOf = (parts: SQL[] | undefined) => parts?.map((part) => new PgDialect().sqlToQuery(part).sql);

describe("dashboard sort", () => {
  it("reads only the four known sorts from the URL; anything else is ignored", () => {
    for (const { value } of SORTS) expect(parseDashboardFilters({ sort: value }, { decision: false }).sort).toBe(value);
    expect(parseDashboardFilters({ sort: "amount; drop table" }, { decision: false }).sort).toBeUndefined();
    expect(parseDashboardFilters({}, { decision: false }).sort).toBeUndefined();
  });

  it("orders amount high to low / low to high and submitted newest / oldest, in SQL", () => {
    expect(sqlOf(dashboardOrderBy("amount_desc"))).toEqual(['"payment_advices"."amount" desc', '"payment_advices"."submitted_at" desc']);
    expect(sqlOf(dashboardOrderBy("amount_asc"))).toEqual(['"payment_advices"."amount" asc', '"payment_advices"."submitted_at" desc']);
    expect(sqlOf(dashboardOrderBy("submitted_desc"))).toEqual(['"payment_advices"."submitted_at" desc']);
    expect(sqlOf(dashboardOrderBy("submitted_asc"))).toEqual(['"payment_advices"."submitted_at" asc']);
    expect(dashboardOrderBy(undefined)).toBeUndefined();
  });

  it("a sort alone is not an active filter (it reorders, it never hides rows)", () => {
    expect(hasActiveFilters({ sort: "amount_desc" })).toBe(false);
    expect(hasActiveFilters({ sort: "amount_desc", q: "x" })).toBe(true);
  });
});

const counts = { total: 5, all: 5, stages: { rejected: 2, waiting_authority: 3 }, decisions: { recommended: 0, sent_back: 0, rejected: 0 } } as never;
const base = { role: "SELF", view: "my-submissions" };

describe("DashboardFilters: Download Report and Sort", () => {
  const html = (filters: object, c = counts) => renderToStaticMarkup(createElement(DashboardFilters, { base, filters, counts: c, showDecision: false }));

  it("puts the Download Report button right after the stage buttons, pointing at the report route with the tab's own query", () => {
    const markup = html({ stage: "rejected", q: "Dreamz", dateFrom: "2026-10-01", sort: "amount_desc" });
    expect(markup).toContain("Download Report");
    const href = /href="(\/api\/authority\/report\?[^"]+)"/.exec(markup)![1].replace(/&amp;/g, "&");
    const params = new URL(href, "http://x").searchParams;
    expect(Object.fromEntries(params)).toEqual({ role: "SELF", view: "my-submissions", stage: "rejected", q: "Dreamz", dateFrom: "2026-10-01", sort: "amount_desc" });
    // After the last stage button, before the sort row.
    expect(markup.indexOf("Rejected (2)")).toBeLessThan(markup.indexOf("Download Report"));
    expect(markup.indexOf("Download Report")).toBeLessThan(markup.indexOf("Sort:"));
  });

  it("is not offered when nothing matches (nothing to export)", () => {
    expect(html({ q: "zzz" }, { ...(counts as object), all: 0 } as never)).not.toContain("Download Report");
  });

  it("offers every sort, marks the chosen one, and keeps stage / search when switching", () => {
    const markup = html({ stage: "rejected", q: "abc", sort: "amount_asc" });
    for (const { label } of SORTS) expect(markup).toContain(label);
    expect(markup).toMatch(/aria-current="true"[^>]*>Amount: Low to High</);
    const high = /href="(\/authority\?[^"]*sort=amount_desc[^"]*)"/.exec(markup)![1].replace(/&amp;/g, "&");
    expect(Object.fromEntries(new URL(high, "http://x").searchParams)).toMatchObject({ stage: "rejected", q: "abc", sort: "amount_desc" });
    const reset = /href="(\/authority\?[^"]*)"[^>]*>Default</.exec(markup)![1].replace(/&amp;/g, "&");
    expect(new URL(reset, "http://x").searchParams.has("sort")).toBe(false);
  });

  it("the Apply form keeps the chosen sort", () => {
    expect(html({ sort: "submitted_asc" })).toContain('<input type="hidden" name="sort" value="submitted_asc"/>');
  });
});

const d = (iso: string) => new Date(iso);
const row = (extra: Partial<DashboardReportRow> = {}): DashboardReportRow => ({
  serialNo: "MCCIA/2026-27/0325", cashVoucherNo: null, advanceNo: null, isAdvance: false, paymentMode: "NEFT",
  payeeName: "DREAMZ VIDEOZ", nature: "Family Business Forum - Ravi Kant", amount: "5000.00", billNo: "B-1",
  submittedBy: "Ganesh Mate", submittedByDepartment: "AI STUDIO", branch: "SB Road Office", authorityName: "Neeraj Thakur",
  submittedAt: d("2026-10-12T04:00:00Z"), status: "SUBMITTED", approvedAt: d("2026-10-13T04:00:00Z"), rejectedAt: null,
  financeReceivedAt: null, verifiedAt: null, paymentDoneAt: null, totalPaid: "0.00", revisionCount: 0,
  authorityRemarks: null, adminRemarks: null, finalRejectedAt: null, finalRejectionRemarks: null, ...extra,
});

const HEADER: Record<string, string> = { reference: "Reference", document: "Document", amount: "Amount (Rs.)", submittedOn: "Submitted On", stage: "Current Stage", remarks: "Remarks" };
/** A cell by its column header (a re-loaded workbook keeps no column keys). */
function cell(sheet: ExcelJS.Worksheet, rowNumber: number, key: keyof typeof HEADER) {
  const headers = (sheet.getRow(1).values as unknown[]).slice(1);
  return sheet.getRow(rowNumber).getCell(headers.indexOf(HEADER[key]) + 1);
}

async function read(rows: DashboardReportRow[]) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await buildDashboardReport(rows, "My Submissions")) as unknown as ArrayBuffer);
  return workbook.worksheets[0];
}

describe("Excel report", () => {
  it("has a header row plus one row per submission, with numeric amounts and real dates", async () => {
    const sheet = await read([row(), row({ serialNo: "MCCIA/2026-27/0326", amount: "378.50", status: "REJECTED", finalRejectionRemarks: "Wrong bill", adminRemarks: "Check", authorityRemarks: "OK" })]);
    expect(sheet.name).toBe("My Submissions");
    expect(sheet.rowCount).toBe(3);
    const headers = (sheet.getRow(1).values as unknown[]).slice(1);
    expect(headers).toEqual(expect.arrayContaining(["Reference", "Payee", "Particulars", "Amount (Rs.)", "Submitted On", "Current Stage", "Remarks"]));
    const first = (key: keyof typeof HEADER) => cell(sheet, 2, key);
    expect(first("reference").value).toBe("MCCIA/2026-27/0325");
    expect(first("amount").value).toBe(5000);
    expect(first("amount").numFmt).toBe("#,##0.00");
    expect(first("submittedOn").value).toEqual(new Date("2026-10-12T00:00:00Z"));
    expect(first("submittedOn").numFmt).toBe("dd-mm-yyyy");
    expect(first("stage").value).toBe("Awaiting Finance Review");
    const second = (key: keyof typeof HEADER) => cell(sheet, 3, key);
    expect(second("amount").value).toBe(378.5);
    expect(second("stage").value).toBe("Rejected");
    expect(second("remarks").value).toBe("Rejected: Wrong bill\nFinance: Check\nAuthority: OK");
  });

  it("names Cash Vouchers and Advances by their own number and document, like the dashboard", async () => {
    const sheet = await read([row({ paymentMode: "CASH", cashVoucherNo: "CASH/MCCIA/2026-27/0049" }), row({ isAdvance: true, advanceNo: "ADV/2026-27/0003" })]);
    expect(cell(sheet, 2, "reference").value).toBe("CASH/MCCIA/2026-27/0049");
    expect(cell(sheet, 2, "document").value).toBe("Cash Payment Voucher");
    expect(cell(sheet, 3, "reference").value).toBe("ADV/2026-27/0003");
  });

  it("an IST-evening submission lands on its IST calendar day, not the UTC one", async () => {
    const sheet = await read([row({ submittedAt: d("2026-10-12T19:30:00Z") })]); // 13 Oct 01:00 IST
    expect(cell(sheet, 2, "submittedOn").value).toEqual(new Date("2026-10-13T00:00:00Z"));
  });

  it("carries no bank details", async () => {
    const headers = ((await read([row()])).getRow(1).values as unknown[]).join("|").toLowerCase();
    expect(headers).not.toMatch(/bank|ifsc|account|beneficiary/);
  });
});
