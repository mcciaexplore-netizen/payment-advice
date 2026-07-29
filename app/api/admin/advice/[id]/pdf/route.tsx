import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { paymentAdvices, auditLog, recommendingAuthorities } from "@/lib/db/schema";
import { renderPaymentAdvicePdf, pdfFilename } from "@/lib/pdf/render";

export const runtime = "nodejs";

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

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
  if (advice.status !== "APPROVED") {
    return NextResponse.json(
      { error: "The Payment Advice PDF is only available once approved." },
      { status: 409 },
    );
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
    actor: "ADMIN",
    ipAddress: clientIp(req),
    details: { serialNo: advice.serialNo },
  });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdfFilename(advice.serialNo)}"`,
    },
  });
}
