import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { cashReceiptCounters, cashReceipts } from "@/lib/db/schema";
import { todayInIst } from "@/lib/date-time";
import { BRANCH_OPTIONS } from "@/lib/validation/payment-advice";
import { getAdminSession } from "@/lib/admin-session";
import { hasRole } from "@/lib/auth";
import { createLocalCashReceipt } from "@/lib/cash-receipt-local-store";
import { getCashReceiptFinancialYear } from "@/lib/cash-receipt-number";

const bodySchema = z.object({
  partyName: z.string().trim().min(1).max(200),
  gstin: z.string().trim().max(15).optional().default(""),
  items: z.array(z.object({
    particulars: z.string().trim().min(1).max(200),
    copies: z.number().int().min(0).max(100000),
    price: z.number().min(0).max(100000000),
    billNo: z.string().max(100).optional().default(""),
    billDate: z.string().max(10).optional().default(""),
  })).min(1).max(20),
});

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Enter valid receipt details." }, { status: 400 });
  }
  const session = await getAdminSession();
  if (!session?.branchScope || !hasRole(session, "BRANCH") || !BRANCH_OPTIONS.includes(session.branchScope as typeof BRANCH_OPTIONS[number])) {
    return NextResponse.json({ error: "Sign in with an authorized branch account to create Cash Receipts." }, { status: 401 });
  }
  const branch = session.branchScope;
  const receiptDate = todayInIst();
  const financialYear = getCashReceiptFinancialYear(receiptDate);
  const { partyName, gstin } = parsed.data;
  const items = parsed.data.items.map((item) => ({
    particulars: item.particulars,
    copies: item.copies,
    price: item.price.toFixed(2),
    amount: (Math.round(item.copies * item.price * 100) / 100).toFixed(2),
    billNo: item.billNo,
    billDate: item.billDate,
  }));
  if (!items.some((item) => item.copies > 0 && Number(item.price) > 0)) {
    return NextResponse.json({ error: "Add at least one receipt item with copies and price." }, { status: 400 });
  }
  if (items.some((item) => item.copies > 0 && Number(item.price) === 0)) {
    return NextResponse.json({ error: "Enter a price for each line with copies." }, { status: 400 });
  }
  const totalPaise = items.reduce((sum, item) => sum + (item.copies ? Math.round(Number(item.amount) * 100) : 0), 0);

  if (process.env.NODE_ENV !== "production") {
    try {
      const receipt = await createLocalCashReceipt({
        branch,
        partyName,
        gstin: gstin || null,
        items,
        total: (totalPaise / 100).toFixed(2),
        issuedBy: session.fullName,
      });
      return NextResponse.json({ id: receipt.id, receiptNumber: receipt.receiptNumber }, { status: 201 });
    } catch (error) {
      console.error("Local cash receipt save failed", error);
      return NextResponse.json({ error: "Could not save the local receipt. Please try again." }, { status: 500 });
    }
  }

  try {
    const receipt = await db.transaction(async (tx) => {
      await tx.execute(sql`insert into ${cashReceiptCounters} (branch, financial_year, last_number) values (${branch}, ${financialYear}, 0) on conflict (branch, financial_year) do nothing`);
      const locked = await tx.execute<{ last_number: number }>(sql`select last_number from ${cashReceiptCounters} where branch = ${branch} and financial_year = ${financialYear} for update`);
      const receiptNumber = Number(locked.rows[0]?.last_number ?? 0) + 1;
      await tx.update(cashReceiptCounters).set({ lastNumber: receiptNumber }).where(sql`${cashReceiptCounters.branch} = ${branch} and ${cashReceiptCounters.financialYear} = ${financialYear}`);
      const [saved] = await tx.insert(cashReceipts).values({
        branch,
        financialYear,
        receiptNumber,
        receiptDate,
        partyName,
        gstin: gstin || null,
        items,
        total: (totalPaise / 100).toFixed(2),
        issuedBy: session.fullName,
      }).returning({ id: cashReceipts.id });
      return { id: saved.id, receiptNumber };
    });
    return NextResponse.json(receipt, { status: 201 });
  } catch (error) {
    console.error("Cash receipt save failed", error);
    return NextResponse.json({ error: "Could not save the receipt. Please try again." }, { status: 500 });
  }
}
