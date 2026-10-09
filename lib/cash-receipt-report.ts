import ExcelJS from "exceljs";

/** MCCIA's bank account that branch cash collections are deposited into,
 * printed on line 2 of the daily Cash Receipts report. The one place this
 * number lives - change it here only. */
export const CASH_RECEIPT_DEPOSIT_ACCOUNT_NO = "0000020097795040";

/** Report category columns, in the order they appear on the sheet (same
 * order as the manual Excel report Finance already uses). */
export const REPORT_CATEGORIES = [
  "COFO",
  "E-Book of MSME Schemes",
  "Hall Rent",
  "Directories",
  "Seminar / Workshop",
  "Sale of Safety Material",
  "Other",
  "Sampada",
] as const;
export type ReportCategory = typeof REPORT_CATEGORIES[number];

/** Form particulars (lib/validation/cash-receipt.ts CASH_RECEIPT_PARTICULARS)
 * to report column. The stored particulars string can carry a suffix the
 * form composes from its sub-fields ("Sale of Directory - Defence Directory
 * - Member (Member ID: 123)", "Course / Seminar Fee: GST Workshop",
 * "Others (Specify): Xyz"), so matching is on the prefix. Anything not listed
 * here, including "Computer Printout / Xerox", falls to "Other". COFO and
 * E-Book of MSME Schemes have no form particulars yet, so those columns
 * stay empty until the form gains matching options. */
export const PARTICULARS_CATEGORY_MAP: ReadonlyArray<readonly [prefix: string, category: ReportCategory]> = [
  ["Sale of Directory", "Directories"],
  ["Sale of Safety Material", "Sale of Safety Material"],
  ["Sampada / Casual Sale", "Sampada"],
  ["Hall Hiring Charges", "Hall Rent"],
  ["Course / Seminar Fee", "Seminar / Workshop"],
];

export function categoryForParticulars(particulars: string): ReportCategory {
  const value = particulars.trim();
  const match = PARTICULARS_CATEGORY_MAP.find(([prefix]) => value === prefix || value.startsWith(`${prefix} `) || value.startsWith(`${prefix}:`));
  return match ? match[1] : "Other";
}

export type ReportReceipt = {
  serialNo: string;
  receiptDate: string;
  partyName: string;
  branch: string;
  total: string;
  items: Array<{ particulars: string; amount: string }>;
};

export type ReportRow = {
  serialNo: string;
  receiptDate: string;
  partyName: string;
  /** Paise per category; a category absent from the receipt is absent here. */
  categoryPaise: Partial<Record<ReportCategory, number>>;
  totalPaise: number;
};

const toPaise = (value: string) => Math.round(Number(value) * 100);
const toRupees = (paise: number) => paise / 100;

/** One row per receipt, never one per item: each item's amount is added to
 * its category column on the receipt's single row (two items in the same
 * category are summed). Sorted by receipt date, then serial. */
export function buildReportRows(receipts: ReportReceipt[]): ReportRow[] {
  return [...receipts]
    .sort((a, b) => a.receiptDate.localeCompare(b.receiptDate) || a.serialNo.localeCompare(b.serialNo))
    .map((receipt) => {
      const categoryPaise: Partial<Record<ReportCategory, number>> = {};
      for (const item of receipt.items) {
        const category = categoryForParticulars(item.particulars);
        categoryPaise[category] = (categoryPaise[category] ?? 0) + toPaise(item.amount);
      }
      return {
        serialNo: receipt.serialNo,
        receiptDate: receipt.receiptDate,
        partyName: receipt.partyName,
        categoryPaise,
        totalPaise: toPaise(receipt.total),
      };
    });
}

export function reportTotals(rows: ReportRow[]) {
  const categoryPaise = Object.fromEntries(REPORT_CATEGORIES.map((category) => [
    category,
    rows.reduce((sum, row) => sum + (row.categoryPaise[category] ?? 0), 0),
  ])) as Record<ReportCategory, number>;
  return { categoryPaise, totalPaise: rows.reduce((sum, row) => sum + row.totalPaise, 0) };
}

/** "2026-09-11" -> "11-9-2026", the unpadded style the manual report uses. */
export function formatReportDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return `${day}-${month}-${year}`;
}

/** Whole rupees print as "2420", anything with paise as "2420.50". */
function formatRupeesForTitle(paise: number): string {
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2);
}

export function reportBranchLabel(receipts: ReportReceipt[]): string {
  return [...new Set(receipts.map((receipt) => receipt.branch))].sort().join(" & ");
}

export function reportFilename(branch: string, from: string, to: string): string {
  const safeBranch = branch.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `CashReceipts_${safeBranch}_${from}_${to}.xlsx`;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Longest range one download may cover. */
export const MAX_REPORT_RANGE_DAYS = 366;

function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Reads and validates dateFrom / dateTo / depositDate. Missing dates
 * default to `today` (an IST calendar date). Returns an error message for a
 * malformed date, a reversed range, or a range over MAX_REPORT_RANGE_DAYS. */
export function parseReportRange(
  searchParams: URLSearchParams,
  today: string,
): { ok: true; from: string; to: string; depositDate: string | null } | { ok: false; error: string } {
  const from = searchParams.get("dateFrom") || today;
  const to = searchParams.get("dateTo") || today;
  const depositDate = searchParams.get("depositDate") || null;
  if (!isRealDate(from) || !isRealDate(to)) return { ok: false, error: "Enter valid From and To dates." };
  if (depositDate && !isRealDate(depositDate)) return { ok: false, error: "Enter a valid deposit date." };
  if (from > to) return { ok: false, error: "From date must be on or before To date." };
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  if (days >= MAX_REPORT_RANGE_DAYS) return { ok: false, error: `Choose a range of at most ${MAX_REPORT_RANGE_DAYS} days.` };
  return { ok: true, from, to, depositDate };
}

const COLUMN_COUNT =3 + REPORT_CATEGORIES.length + 1;
const AMOUNT_FORMAT = "#,##0.00";
const HEADER_ROW = 3;
const THIN = { style: "thin" as const };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };

/** Builds the daily Cash Receipts report workbook. Layout follows the
 * manual report Finance already keeps: two bold title lines, a blue bold
 * header row, one bordered row per receipt, and a totals row whose cells
 * are SUM formulas (with cached results, so viewers that do not recalculate
 * still show the right figures). */
export function buildCashReceiptReportWorkbook(input: {
  receipts: ReportReceipt[];
  from: string;
  to: string;
  depositDate?: string | null;
}): ExcelJS.Workbook {
  const rows = buildReportRows(input.receipts);
  const totals = reportTotals(rows);
  const branch = reportBranchLabel(input.receipts);
  const grandTotal = formatRupeesForTitle(totals.totalPaise);
  const period = input.from === input.to
    ? `on ${formatReportDate(input.from)}`
    : `from ${formatReportDate(input.from)} to ${formatReportDate(input.to)}`;
  const deposited = input.depositDate ? formatReportDate(input.depositDate) : "____________";

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MCCIA Payment Desk";
  const sheet = workbook.addWorksheet("Cash Receipts", {
    pageSetup: {
      orientation: "landscape",
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
  });
  sheet.columns = [
    { width: 22 },
    { width: 12 },
    { width: 34 },
    ...REPORT_CATEGORIES.map(() => ({ width: 13 })),
    { width: 13 },
  ];

  const titleLines = [
    `Cash Collected Rs.${grandTotal}/- at ${branch} ${period}`,
    `Cash Rs.${grandTotal}/- deposited in MCCIA's Account No. ${CASH_RECEIPT_DEPOSIT_ACCOUNT_NO} on ${deposited}`,
  ];
  titleLines.forEach((text, index) => {
    const rowNumber = index + 1;
    sheet.mergeCells(rowNumber, 1, rowNumber, COLUMN_COUNT);
    const cell = sheet.getCell(rowNumber, 1);
    cell.value = text;
    cell.font = { bold: true, size: 14 };
    cell.alignment = { vertical: "middle" };
    cell.border = BORDER;
    sheet.getRow(rowNumber).height = 24;
  });

  const header = sheet.getRow(HEADER_ROW);
  header.values = ["Cash Receipt No.", "Date", "Customer name", ...REPORT_CATEGORIES, "Total"];
  header.height = 48;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FF0000FF" } };
    cell.alignment = { vertical: "bottom", wrapText: true };
    cell.border = BORDER;
  });

  rows.forEach((row, index) => {
    const excelRow = sheet.getRow(HEADER_ROW + 1 + index);
    const [year, month, day] = row.receiptDate.split("-").map(Number);
    excelRow.values = [
      row.serialNo,
      // UTC midnight so the calendar day survives regardless of server TZ
      // (same approach as app/api/admin/export/route.ts).
      new Date(Date.UTC(year, month - 1, day)),
      row.partyName,
      ...REPORT_CATEGORIES.map((category) => row.categoryPaise[category] === undefined ? null : toRupees(row.categoryPaise[category]!)),
      toRupees(row.totalPaise),
    ];
    for (let column = 1; column <= COLUMN_COUNT; column++) {
      const cell = excelRow.getCell(column);
      cell.border = BORDER;
      cell.alignment = { vertical: "top", wrapText: column === 3 };
      if (column === 2) cell.numFmt = "dd-mm-yyyy";
      if (column >= 4) cell.numFmt = AMOUNT_FORMAT;
    }
  });

  const firstDataRow = HEADER_ROW + 1;
  const lastDataRow = HEADER_ROW + rows.length;
  const totalsRow = sheet.getRow(lastDataRow + 1);
  for (let column = 1; column <= COLUMN_COUNT; column++) {
    const cell = totalsRow.getCell(column);
    cell.border = BORDER;
    if (column === 3) {
      cell.value = "Total";
      cell.font = { bold: true };
      cell.alignment = { horizontal: "right" };
    }
    if (column >= 4) {
      const letter = sheet.getColumn(column).letter;
      const paise = column === COLUMN_COUNT ? totals.totalPaise : totals.categoryPaise[REPORT_CATEGORIES[column - 4]];
      cell.value = { formula: `SUM(${letter}${firstDataRow}:${letter}${lastDataRow})`, result: toRupees(paise) };
      cell.font = { bold: true };
      cell.numFmt = AMOUNT_FORMAT;
    }
  }

  return workbook;
}
