import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { paymentAdvices, recommendingAuthorities } from "@/lib/db/schema";
import { authorityActionError } from "@/lib/advice/authority-token";
import { performAuthorityApproval } from "@/lib/advice/authority-actions";

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

  const [authority] = await db
    .select({ authorityName: recommendingAuthorities.authorityName })
    .from(recommendingAuthorities)
    .where(eq(recommendingAuthorities.id, advice.recommendingAuthorityId))
    .limit(1);

  const now = await performAuthorityApproval({
    advice,
    actor: authority?.authorityName ?? "Recommending Authority",
    ipAddress: clientIp(req),
  });

  return NextResponse.json({ ok: true, approvedAt: now.toISOString() });
}
