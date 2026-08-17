import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { advanceParticulars, paymentAdvices, auditLog, recommendingAuthorities } from "@/lib/db/schema";
import { renderPaymentAdvicePdf, pdfFilename } from "@/lib/pdf/render";
import { displayNoFor } from "@/lib/advice/document-identity";
import type { PaymentMode } from "@/lib/validation/payment-advice";

export const runtime = "nodejs";

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

// Public, unauthenticated, and deliberately NOT gated on APPROVED status —
// this is the printable copy submitters take for physical signing, which
// per MCCIA's process happens before Finance approval, not after. It is
// keyed by the advice's UUID `id` rather than its (sequential, guessable)
// serial number, so this stays safe from enumeration the same way the
// /submitted/[serial] confirmation page's sessionStorage handoff does:
// only someone who already has this exact link (the submitter, from their
// own confirmation page) can reach it. 404s for Cash submissions — they
// never get a Payment Advice PDF, only the Cash Payment Voucher.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [advice] = await db
    .select()
    .from(paymentAdvices)
    .where(eq(paymentAdvices.id, id))
    .limit(1);

  if (!advice || advice.paymentMode === "CASH") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [authority, particulars] = await Promise.all([
    db
      .select({ authorityName: recommendingAuthorities.authorityName })
      .from(recommendingAuthorities)
      .where(eq(recommendingAuthorities.id, advice.recommendingAuthorityId))
      .limit(1)
      .then((rows) => rows[0]),
    advice.isAdvance
      ? db
          .select()
          .from(advanceParticulars)
          .where(eq(advanceParticulars.paymentAdviceId, advice.id))
          .orderBy(asc(advanceParticulars.sortOrder))
      : Promise.resolve([]),
  ]);

  const buffer = await renderPaymentAdvicePdf(advice, authority?.authorityName ?? "", particulars);

  await db.insert(auditLog).values({
    paymentAdviceId: advice.id,
    action: "PDF_GENERATED",
    actor: advice.submittedByName,
    ipAddress: clientIp(req),
    details: { serialNo: advice.serialNo, source: "public" },
  });

  const displayNo = displayNoFor(
    advice.paymentMode as PaymentMode,
    advice.serialNo,
    advice.cashVoucherNo,
    advice.isAdvance,
    advice.advanceNo,
  );
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdfFilename(displayNo)}"`,
    },
  });
}
