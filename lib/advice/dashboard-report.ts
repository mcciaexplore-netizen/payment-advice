import ExcelJS from "exceljs";
import { displayNoFor, documentLabelFor } from "@/lib/advice/document-identity";
import { pipelineStageFor } from "@/lib/advice/pipeline-stage";
import { stageFilterLabel } from "@/lib/advice/dashboard-filters";
import type { PaymentMode } from "@/lib/validation/payment-advice";

/** One submission as the Excel report needs it: the dashboard table's own
 * columns plus the dates and remarks behind its Current Stage. No bank
 * details - the report holds no more than the dashboard can show. */
export type DashboardReportRow = {
  serialNo: string;
  cashVoucherNo: string | null;
  advanceNo: string | null;
  isAdvance: boolean;
  paymentMode: string;
  payeeName: string;
  nature: string;
  amount: string;
  billNo: string;
  submittedBy: string;
  submittedByDepartment: string;
  branch: string | null;
  authorityName: string | null;
  submittedAt: Date;
  status: string;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  financeReceivedAt: Date | null;
  verifiedAt: Date | null;
  paymentDoneAt: Date | null;
  totalPaid: string;
  revisionCount: number;
  authorityRemarks: string | null;
  adminRemarks: string | null;
  finalRejectedAt: Date | null;
  finalRejectionRemarks: string | null;
};

const DATE_FORMAT = "dd-mm-yyyy";
const MONEY_FORMAT = "#,##0.00";

/** Absolute timestamp -> the IST calendar day it falls on, as a UTC-midnight
 * Date: ExcelJS writes Date#getTime(), so this always shows the right day
 * whatever timezone the server runs in. */
function istDay(value: Date | null): Date | null {
  if (!value) return null;
  return new Date(`${value.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })}T00:00:00Z`);
}

const COLUMNS: { header: string; key: string; width: number; numFmt?: string }[] = [
  { header: "Reference", key: "reference", width: 26 },
  { header: "Document", key: "document", width: 22 },
  { header: "Payee", key: "payee", width: 28 },
  { header: "Particulars", key: "particulars", width: 44 },
  { header: "Amount (Rs.)", key: "amount", width: 16, numFmt: MONEY_FORMAT },
  { header: "Submitted On", key: "submittedOn", width: 14, numFmt: DATE_FORMAT },
  { header: "Submitted By", key: "submittedBy", width: 22 },
  { header: "Department", key: "department", width: 20 },
  { header: "Branch", key: "branch", width: 18 },
  { header: "Recommending Authority", key: "authority", width: 24 },
  { header: "Current Stage", key: "stage", width: 28 },
  { header: "Recommended On", key: "recommendedOn", width: 16, numFmt: DATE_FORMAT },
  { header: "Finance Received On", key: "receivedOn", width: 18, numFmt: DATE_FORMAT },
  { header: "Verified On", key: "verifiedOn", width: 14, numFmt: DATE_FORMAT },
  { header: "Payment Done On", key: "paidOn", width: 16, numFmt: DATE_FORMAT },
  { header: "Total Paid (Rs.)", key: "totalPaid", width: 16, numFmt: MONEY_FORMAT },
  { header: "Bill No.", key: "billNo", width: 16 },
  { header: "Revisions", key: "revisions", width: 10 },
  { header: "Remarks", key: "remarks", width: 44 },
];

/** Remarks the submitter would see on the dashboard, labelled by who wrote
 * them, joined into one cell. */
function remarksFor(row: DashboardReportRow): string {
  return [
    row.finalRejectionRemarks ? `Rejected: ${row.finalRejectionRemarks}` : "",
    row.adminRemarks ? `Finance: ${row.adminRemarks}` : "",
    row.authorityRemarks ? `Authority: ${row.authorityRemarks}` : "",
  ].filter(Boolean).join("\n");
}

export async function buildDashboardReport(rows: DashboardReportRow[], sheetName: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = COLUMNS;
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B1F3A" } };
  header.alignment = { vertical: "middle" };

  for (const row of rows) {
    const paymentMode = row.paymentMode as PaymentMode;
    const added = sheet.addRow({
      reference: displayNoFor(paymentMode, row.serialNo, row.cashVoucherNo, row.isAdvance, row.advanceNo),
      document: documentLabelFor(paymentMode, row.isAdvance),
      payee: row.payeeName,
      particulars: row.nature,
      amount: Number(row.amount),
      submittedOn: istDay(row.submittedAt),
      submittedBy: row.submittedBy,
      department: row.submittedByDepartment,
      branch: row.branch ?? "",
      authority: row.authorityName ?? "",
      stage: stageFilterLabel(pipelineStageFor(row)),
      recommendedOn: istDay(row.approvedAt),
      receivedOn: istDay(row.financeReceivedAt),
      verifiedOn: istDay(row.verifiedAt),
      paidOn: istDay(row.paymentDoneAt),
      totalPaid: Number(row.totalPaid),
      billNo: row.billNo,
      revisions: row.revisionCount,
      remarks: remarksFor(row),
    });
    // ExcelJS does not reliably carry column-level numFmt onto each cell, so
    // it is set per cell (same approach as the Finance export).
    for (const column of COLUMNS) if (column.numFmt) added.getCell(column.key).numFmt = column.numFmt;
    added.getCell("particulars").alignment = { wrapText: true, vertical: "top" };
    added.getCell("remarks").alignment = { wrapText: true, vertical: "top" };
  }

  // Filter dropdowns on every column, so the file can be re-sorted in Excel.
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
