import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog, cashReceipts } from "@/lib/db/schema";
import { getAdminSession } from "@/lib/admin-session";
import { hasCashReceiptRole, hasFinanceRole } from "@/lib/auth";
import { todayInIst } from "@/lib/date-time";
import { BRANCH_OPTIONS } from "@/lib/validation/payment-advice";
import {
  buildCashReceiptReportWorkbook,
  parseReportRange,
  reportBranchLabel,
  reportFilename,
} from "@/lib/cash-receipt-report";

export const runtime = "nodejs";

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/** Daily Cash Receipts report (.xlsx) for a date range.
 *
 * Who gets what is decided here, never by the client:
 * - A Finance session that passes ?branch= gets every receipt in that
 *   branch (the /admin/cash-receipts button).
 * - Otherwise a Cash Receipt issuer gets only receipts they issued
 *   (issuedByUserId = their own session id). Any ?branch= they send is
 *   ignored, so no parameter can widen the query to someone else's receipts.
 * - Anyone else gets 404, the same answer the single-receipt routes give. */
export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const params = req.nextUrl.searchParams;
  const range = parseReportRange(params, todayInIst());
  if (!range.ok) return NextResponse.json({ error: range.error }, { status: 400 });

  const requestedBranch = params.get("branch");
  const dateWhere = and(gte(cashReceipts.receiptDate, range.from), lte(cashReceipts.receiptDate, range.to));
  let scopeWhere;
  let scope: "branch" | "issuer";
  if (hasFinanceRole(session) && requestedBranch) {
    if (!BRANCH_OPTIONS.includes(requestedBranch as typeof BRANCH_OPTIONS[number])) {
      return NextResponse.json({ error: "Select a valid branch." }, { status: 400 });
    }
    scopeWhere = eq(cashReceipts.branch, requestedBranch);
    scope = "branch";
  } else if (hasCashReceiptRole(session)) {
    scopeWhere = eq(cashReceipts.issuedByUserId, session.adminUserId);
    scope = "issuer";
  } else if (hasFinanceRole(session)) {
    return NextResponse.json({ error: "Select a branch." }, { status: 400 });
  } else {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const receipts = await db
    .select({
      serialNo: cashReceipts.serialNo,
      receiptDate: cashReceipts.receiptDate,
      partyName: cashReceipts.partyName,
      branch: cashReceipts.branch,
      total: cashReceipts.total,
      items: cashReceipts.items,
    })
    .from(cashReceipts)
    .where(and(scopeWhere, dateWhere));

  if (receipts.length === 0) {
    return NextResponse.json({ error: "No Cash Receipts in this date range, so there is no report to download." }, { status: 404 });
  }

  const workbook = buildCashReceiptReportWorkbook({ receipts, from: range.from, to: range.to, depositDate: range.depositDate });
  const buffer = await workbook.xlsx.writeBuffer();
  const branch = reportBranchLabel(receipts);
  const totalPaise = receipts.reduce((sum, receipt) => sum + Math.round(Number(receipt.total) * 100), 0);

  await db.insert(auditLog).values({
    action: "CASH_RECEIPT_REPORT_DOWNLOADED",
    actor: session.fullName,
    ipAddress: clientIp(req),
    details: {
      from: range.from,
      to: range.to,
      depositDate: range.depositDate,
      branch,
      scope,
      count: receipts.length,
      total: (totalPaise / 100).toFixed(2),
    },
  });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${reportFilename(branch, range.from, range.to)}"`,
      "Cache-Control": "no-store",
    },
  });
}
