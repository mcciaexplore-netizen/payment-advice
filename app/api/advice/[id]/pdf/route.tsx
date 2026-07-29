import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { paymentAdvices, auditLog, recommendingAuthorities } from "@/lib/db/schema";
import { renderPaymentAdvicePdf, pdfFilename } from "@/lib/pdf/render";

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
// own confirmation page) can reach it.
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

  if (!advice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [authority] = await db
    .select({ authorityName: recommendingAuthorities.authorityName })
    .from(recommendingAuthorities)
    .where(eq(recommendingAuthorities.id, advice.recommendingAuthorityId))
    .limit(1);

  const buffer = await renderPaymentAdvicePdf(advice, authority?.authorityName ?? "");

  await db.insert(auditLog).values({
    paymentAdviceId: advice.id,
    action: "PDF_GENERATED",
    actor: advice.submittedByName,
    ipAddress: clientIp(req),
    details: { serialNo: advice.serialNo, source: "public" },
  });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdfFilename(advice.serialNo)}"`,
    },
  });
}
