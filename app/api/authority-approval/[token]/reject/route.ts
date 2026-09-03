import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { paymentAdvices, recommendingAuthorities } from "@/lib/db/schema";
import { authorityActionError } from "@/lib/advice/authority-token";
import { performAuthorityRejection } from "@/lib/advice/authority-actions";
import { authorityRejectSchema } from "@/lib/validation/payment-advice";

export const runtime = "nodejs";

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const [advice] = await db
    .select({
      id: paymentAdvices.id,
      serialNo: paymentAdvices.serialNo,
      cashVoucherNo: paymentAdvices.cashVoucherNo,
      isAdvance: paymentAdvices.isAdvance,
      advanceNo: paymentAdvices.advanceNo,
      paymentMode: paymentAdvices.paymentMode,
      submittedByName: paymentAdvices.submittedByName,
      submittedByEmail: paymentAdvices.submittedByEmail,
      payeeName: paymentAdvices.payeeName,
      amount: paymentAdvices.amount,
      authorityApprovedAt: paymentAdvices.authorityApprovedAt,
      authorityRejectedAt: paymentAdvices.authorityRejectedAt,
      authorityTokenExpiresAt: paymentAdvices.authorityTokenExpiresAt,
      recommendingAuthorityId: paymentAdvices.recommendingAuthorityId,
    })
    .from(paymentAdvices)
    .where(eq(paymentAdvices.authorityToken, token))
    .limit(1);
  if (!advice) {
    return NextResponse.json({ error: "This approval link is not valid." }, { status: 404 });
  }

  const actionError = authorityActionError(advice);
  if (actionError) {
    return NextResponse.json({ error: actionError }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  const parsed = authorityRejectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Remarks are required" },
      { status: 400 },
    );
  }

  const [authority] = await db
    .select({ authorityName: recommendingAuthorities.authorityName })
    .from(recommendingAuthorities)
    .where(eq(recommendingAuthorities.id, advice.recommendingAuthorityId))
    .limit(1);
  const authorityName = authority?.authorityName ?? "Recommending Authority";

  await performAuthorityRejection({
    advice,
    actor: authorityName,
    remarks: parsed.data.remarks,
    ipAddress: clientIp(req),
    origin: new URL(req.url).origin,
  });

  return NextResponse.json({ ok: true });
}
