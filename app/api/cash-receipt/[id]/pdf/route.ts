import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog, cashReceipts } from "@/lib/db/schema";
import { getAdminSession } from "@/lib/admin-session";
import { hasFinanceRole, hasRole } from "@/lib/auth";
import { canAccessCashReceipt } from "@/lib/advice/cash-receipt-access";
import { getLocalCashReceipt } from "@/lib/cash-receipt-local-store";
import { formatCashReceiptNumber } from "@/lib/cash-receipt-number";
import { renderCashReceiptPdf } from "@/lib/pdf/render-cash-receipt";

export const runtime = "nodejs";

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getAdminSession();
  const isProd = process.env.NODE_ENV === "production";

  if (!isProd) {
    // Local dev fallback - same branch-only check the View page's own
    // local-dev path uses, for the same reason (no real admin_users id to
    // check person-level ownership against).
    const isFinanceAdmin = hasFinanceRole(session);
    const isBranchAccount = Boolean(session?.branchScope) && hasRole(session, "BRANCH");
    if (!session || (!isFinanceAdmin && !isBranchAccount)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const receipt = await getLocalCashReceipt(id);
    if (!receipt || (!isFinanceAdmin && receipt.branch !== session.branchScope)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const buffer = await renderCashReceiptPdf({
      serialNo: formatCashReceiptNumber(receipt.branch, receipt.receiptDate, receipt.receiptNumber),
      receiptDate: receipt.receiptDate,
      partyName: receipt.partyName,
      gstin: receipt.gstin,
      items: receipt.items,
      total: receipt.total,
      issuedBy: receipt.issuedBy,
    });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="cash-receipt-${id}.pdf"`,
      },
    });
  }

  const [receipt] = await db.select().from(cashReceipts).where(eq(cashReceipts.id, id)).limit(1);
  // Same person-level check as the View page - a branch account may only
  // download a receipt it personally issued, never a colleague's. 404, not
  // 403, for a denied branch account: the existence of another person's
  // receipt ID is not confirmed to someone who cannot open it. Finance
  // sessions can download any.
  if (!receipt || !canAccessCashReceipt(session, receipt)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const buffer = await renderCashReceiptPdf({
    serialNo: receipt.serialNo,
    receiptDate: receipt.receiptDate,
    partyName: receipt.partyName,
    gstin: receipt.gstin,
    items: receipt.items,
    total: receipt.total,
    issuedBy: receipt.submittedByName,
  });

  await db.insert(auditLog).values({
    cashReceiptId: receipt.id,
    action: "CASH_RECEIPT_PDF_GENERATED",
    actor: session!.fullName,
    ipAddress: clientIp(req),
    details: { serialNo: receipt.serialNo, source: "download" },
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="cash-receipt-${receipt.serialNo.replace(/\//g, "-")}.pdf"`,
    },
  });
}
