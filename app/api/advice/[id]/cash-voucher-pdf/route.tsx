import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog, cashVoucherItems, paymentAdvices, recommendingAuthorities } from "@/lib/db/schema";
import { cashVoucherPdfFilename, renderCashVoucherPdf } from "@/lib/pdf/render";

export const runtime = "nodejs";

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/** Public UUID-keyed voucher download, available before approval for wet signatures. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [advice] = await db.select().from(paymentAdvices).where(eq(paymentAdvices.id, id)).limit(1);
  if (!advice || advice.paymentMode !== "CASH") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [authorityRows, items] = await Promise.all([
    db.select({ authorityName: recommendingAuthorities.authorityName })
      .from(recommendingAuthorities)
      .where(eq(recommendingAuthorities.id, advice.recommendingAuthorityId))
      .limit(1),
    db.select().from(cashVoucherItems).where(eq(cashVoucherItems.paymentAdviceId, advice.id)).orderBy(asc(cashVoucherItems.sortOrder)),
  ]);
  const authority = authorityRows[0];
  const buffer = await renderCashVoucherPdf(advice, items, authority?.authorityName ?? "");
  await db.insert(auditLog).values({
    paymentAdviceId: advice.id,
    action: "PDF_GENERATED",
    actor: advice.submittedByName,
    ipAddress: clientIp(req),
    details: { serialNo: advice.serialNo, source: "public", document: "cash_voucher" },
  });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${cashVoucherPdfFilename(advice.cashVoucherNo ?? advice.serialNo)}"`,
    },
  });
}
