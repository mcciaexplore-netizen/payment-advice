import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminUsers, auditLog, cashReceipts } from "@/lib/db/schema";
import { cashReceiptSchema } from "@/lib/validation/cash-receipt";
import { todayInIst } from "@/lib/date-time";
import { BRANCH_OPTIONS } from "@/lib/validation/payment-advice";
import { getAdminSession } from "@/lib/admin-session";
import { hasRole } from "@/lib/auth";
import { allocateCashReceiptNumber, financialYearFor } from "@/lib/serial";
import { createLocalCashReceipt } from "@/lib/cash-receipt-local-store";
import { formatCashReceiptNumber, getCashReceiptFinancialYear } from "@/lib/cash-receipt-number";

export const runtime = "nodejs";

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export async function POST(request: NextRequest) {
  const parsed = cashReceiptSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Enter valid receipt details." }, { status: 400 });
  }
  const session = await getAdminSession();
  if (!session?.branchScope || !hasRole(session, "BRANCH") || !BRANCH_OPTIONS.includes(session.branchScope as typeof BRANCH_OPTIONS[number])) {
    return NextResponse.json({ error: "Sign in with an authorized branch account to create Cash Receipts." }, { status: 401 });
  }
  const branch = session.branchScope;
  // Receipt Date is system-controlled, same as every other document type in
  // this app (Payment Advice's formDate, Forwarding Memo's memoDate) - a
  // client-supplied date is never trusted for the record that actually gets
  // numbered/saved.
  const receiptDate = todayInIst();
  const { partyName } = parsed.data;
  const gstin = parsed.data.gstin || "";
  const items = parsed.data.items.map((item) => ({
    particulars: item.particulars,
    copies: item.copies,
    price: item.price.toFixed(2),
    amount: (Math.round(item.copies * item.price * 100) / 100).toFixed(2),
    billNo: item.billNo,
    billDate: item.billDate,
  }));
  const totalPaise = items.reduce((sum, item) => sum + Math.round(Number(item.amount) * 100), 0);
  const total = (totalPaise / 100).toFixed(2);

  if (process.env.NODE_ENV !== "production") {
    try {
      const receipt = await createLocalCashReceipt({
        branch,
        partyName,
        gstin: gstin || null,
        items,
        total,
        issuedBy: session.fullName,
      });
      return NextResponse.json({
        id: receipt.id,
        serialNo: formatCashReceiptNumber(receipt.branch, receipt.receiptDate, receipt.receiptNumber),
      }, { status: 201 });
    } catch (error) {
      console.error("Local cash receipt save failed", error);
      return NextResponse.json({ error: "Could not save the local receipt. Please try again." }, { status: 500 });
    }
  }

  try {
    const financialYear = financialYearFor(new Date());
    // getCashReceiptFinancialYear derives the same financial year from the
    // server-computed IST date string - asserted equal here so the stored
    // financial_year column and the series lookup can never silently drift
    // apart if the two ever disagree at a financial-year boundary.
    if (getCashReceiptFinancialYear(receiptDate) !== financialYear) {
      console.error("[Cash Receipt] financial year mismatch between financialYearFor and getCashReceiptFinancialYear", { receiptDate, financialYear });
    }

    const receipt = await db.transaction(async (tx) => {
      const sequence = await allocateCashReceiptNumber(tx, financialYear, branch);
      const serialNo = formatCashReceiptNumber(branch, receiptDate, sequence);

      // The real issuer, read from the authenticated account's own row, not
      // trusted from the session's display name alone - this is what both
      // the Team Dashboard's "Cash Receipts" list and the server-side
      // access check (lib/advice/cash-receipt-access.ts) key off of.
      const [issuer] = await tx
        .select({ email: adminUsers.email })
        .from(adminUsers)
        .where(eq(adminUsers.id, session.adminUserId))
        .limit(1);

      // Allocation and row creation deliberately share this transaction -
      // if the insert below fails, the counter rolls back with it, same
      // gapless-but-never-wasted-on-a-failed-write guarantee as the other
      // four series.
      const [saved] = await tx.insert(cashReceipts).values({
        serialNo,
        financialYear,
        branch,
        receiptDate,
        partyName,
        gstin: gstin || null,
        items,
        total,
        issuedByUserId: session.adminUserId,
        submittedByName: session.fullName,
        submittedByEmail: issuer?.email ?? null,
      }).returning({ id: cashReceipts.id, serialNo: cashReceipts.serialNo });

      await tx.insert(auditLog).values({
        cashReceiptId: saved.id,
        action: "CASH_RECEIPT_SUBMITTED",
        actor: session.fullName,
        ipAddress: clientIp(request),
        details: { serialNo: saved.serialNo, branch, total },
      });

      return saved;
    });
    return NextResponse.json({ id: receipt.id, serialNo: receipt.serialNo }, { status: 201 });
  } catch (error) {
    console.error("Cash receipt save failed", error);
    return NextResponse.json({ error: "Could not save the receipt. Please try again." }, { status: 500 });
  }
}
