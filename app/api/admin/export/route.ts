import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { paymentAdvices, recommendingAuthorities, auditLog } from "@/lib/db/schema";
import {
  buildAdviceWhere,
  buildOrderBy,
  parseAdviceFilterParams,
} from "@/lib/admin/filters";

export const runtime = "nodejs";

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/** Pure calendar date string ("YYYY-MM-DD") -> UTC-midnight Date. ExcelJS
 * serializes dates from Date#getTime() (UTC epoch ms), so a UTC-midnight
 * Date always round-trips to the exact calendar day, independent of the
 * server's local timezone. */
function dateOnlyToExcelDate(value: string | null): Date | null {
  if (!value) return null;
  return new Date(`${value}T00:00:00Z`);
}

/** Absolute timestamp -> the IST calendar date it falls on (MCCIA's
 * timezone), as a UTC-midnight Date for the same reason as above. */
function timestampToIstExcelDate(value: Date | null): Date | null {
  if (!value) return null;
  const istDateString = value.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return new Date(`${istDateString}T00:00:00Z`);
}

const DATE_FORMAT = "dd-mm-yyyy";

const COLUMNS: { header: string; key: string; width: number; numFmt?: string }[] = [
  { header: "Serial No.", key: "serialNo", width: 22 },
  { header: "Financial Year", key: "financialYear", width: 14 },
  { header: "Status", key: "status", width: 12 },
  { header: "Form Date", key: "formDate", width: 12, numFmt: DATE_FORMAT },
  { header: "Submitted On", key: "submittedOn", width: 14, numFmt: DATE_FORMAT },
  { header: "Approved On", key: "approvedOn", width: 14, numFmt: DATE_FORMAT },
  { header: "Approved By", key: "approvedBy", width: 20 },
  { header: "Submitted By", key: "submittedBy", width: 20 },
  { header: "Submitter Email", key: "submitterEmail", width: 26 },
  { header: "Department", key: "department", width: 20 },
  { header: "Recommending Authority", key: "recommendingAuthority", width: 28 },
  { header: "Payee Name", key: "payeeName", width: 24 },
  { header: "Payee Address", key: "payeeAddress", width: 30 },
  { header: "Payee GSTIN", key: "payeeGstin", width: 18 },
  { header: "Payee Udyam", key: "payeeUdyam", width: 18 },
  { header: "Payee Email", key: "payeeEmail", width: 24 },
  { header: "Contact Person", key: "contactPerson", width: 20 },
  { header: "Contact Phone", key: "contactPhone", width: 16 },
  { header: "Bill No.", key: "billNo", width: 16 },
  { header: "Bill Date", key: "billDate", width: 12, numFmt: DATE_FORMAT },
  { header: "PO No.", key: "poNo", width: 16 },
  { header: "PO Date", key: "poDate", width: 12, numFmt: DATE_FORMAT },
  { header: "Delivery Challan No.", key: "deliveryChallanNo", width: 18 },
  { header: "Delivery Challan Date", key: "deliveryChallanDate", width: 16, numFmt: DATE_FORMAT },
  { header: "Nature of Expenditure", key: "natureOfExpenditure", width: 40 },
  { header: "Amount", key: "amount", width: 14, numFmt: "#,##0.00" },
  { header: "Bill Passed For", key: "billPassedFor", width: 14, numFmt: "#,##0.00" },
  { header: "Payment Mode", key: "paymentMode", width: 12 },
  { header: "Bank A/c No.", key: "bankAccountNo", width: 18 },
  { header: "IFSC", key: "bankIfsc", width: 14 },
  { header: "Beneficiary Name", key: "beneficiaryName", width: 22 },
  { header: "Enclosures", key: "enclosures", width: 30 },
  { header: "Special Remarks", key: "specialRemarks", width: 30 },
  { header: "Revision Count", key: "revisionCount", width: 12 },
];

export async function GET(req: NextRequest) {
  const filterParams = parseAdviceFilterParams(req.nextUrl.searchParams);
  const where = buildAdviceWhere(filterParams);
  const sort = req.nextUrl.searchParams.get("sort") ?? undefined;
  const dir = req.nextUrl.searchParams.get("dir") ?? undefined;
  const orderBy = buildOrderBy(sort, dir);

  const rows = await db
    .select({
      advice: paymentAdvices,
      authorityName: recommendingAuthorities.authorityName,
    })
    .from(paymentAdvices)
    .leftJoin(
      recommendingAuthorities,
      eq(paymentAdvices.recommendingAuthorityId, recommendingAuthorities.id),
    )
    .where(where)
    .orderBy(orderBy);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Payment Advices", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = COLUMNS;
  sheet.getRow(1).font = { bold: true };

  // ExcelJS does not reliably apply `numFmt` set only at the column-definition
  // level to each cell's style — verified directly by inspecting the written
  // XML, where column-level numFmt silently fell back to a mismatched
  // built-in format (or none at all for numeric columns). Setting it on each
  // cell after addRow is what actually produces a correct <numFmt> in the file.
  const dateColumnKeys = ["formDate", "submittedOn", "approvedOn", "billDate", "poDate", "deliveryChallanDate"];
  const numberColumnKeys = ["amount", "billPassedFor"];

  for (const { advice, authorityName } of rows) {
    const row = sheet.addRow({
      serialNo: advice.serialNo,
      financialYear: advice.financialYear,
      status: advice.status,
      formDate: dateOnlyToExcelDate(advice.formDate),
      submittedOn: timestampToIstExcelDate(advice.submittedAt),
      approvedOn: timestampToIstExcelDate(advice.approvedAt),
      approvedBy: advice.approvedByName ?? "",
      submittedBy: advice.submittedByName,
      submitterEmail: advice.submittedByEmail,
      department: advice.submittedByDepartment,
      recommendingAuthority: authorityName ?? "",
      payeeName: advice.payeeName,
      payeeAddress: advice.payeeAddress,
      payeeGstin: advice.payeeGstin ?? "",
      payeeUdyam: advice.payeeUdyamNumber ?? "",
      payeeEmail: advice.payeeEmail ?? "",
      contactPerson: advice.payeeContactPerson ?? "",
      contactPhone: advice.payeeContactPhone ?? "",
      billNo: advice.billNo,
      billDate: dateOnlyToExcelDate(advice.billDate),
      poNo: advice.poNumber ?? "",
      poDate: dateOnlyToExcelDate(advice.poDate),
      deliveryChallanNo: advice.deliveryChallanNo ?? "",
      deliveryChallanDate: dateOnlyToExcelDate(advice.deliveryChallanDate),
      natureOfExpenditure: advice.natureOfExpenditure,
      amount: Number(advice.amount),
      billPassedFor: advice.billPassedFor ? Number(advice.billPassedFor) : null,
      paymentMode: advice.paymentMode,
      bankAccountNo: advice.bankAccountNo ?? "",
      bankIfsc: advice.bankIfsc ?? "",
      beneficiaryName: advice.beneficiaryName ?? "",
      enclosures: advice.enclosures ?? "",
      specialRemarks: advice.specialRemarks ?? "",
      revisionCount: advice.revisionCount,
    });

    for (const key of dateColumnKeys) row.getCell(key).numFmt = DATE_FORMAT;
    for (const key of numberColumnKeys) row.getCell(key).numFmt = "#,##0.00";
  }

  const buffer = await workbook.xlsx.writeBuffer();

  await db.insert(auditLog).values({
    paymentAdviceId: null,
    action: "EXPORTED",
    actor: "ADMIN",
    ipAddress: clientIp(req),
    details: { filterParams, rowCount: rows.length },
  });

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const filename = `MCCIA-Payment-Advices-${today}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
