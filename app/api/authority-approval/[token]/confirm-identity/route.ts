import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { paymentAdvices, auditLog, recommendingAuthorities } from "@/lib/db/schema";
import { authorityActionError } from "@/lib/advice/authority-token";
import {
  emailsMatch,
  identityCookieName,
  IDENTITY_ATTEMPT_LIMIT,
  IDENTITY_ATTEMPT_WINDOW_MS,
} from "@/lib/advice/authority-identity";
import { authorityIdentityConfirmSchema } from "@/lib/validation/payment-advice";

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

  const windowStart = new Date(Date.now() - IDENTITY_ATTEMPT_WINDOW_MS);
  const [{ count: recentFailures }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.paymentAdviceId, advice.id),
        eq(auditLog.action, "AUTHORITY_IDENTITY_CHECK_FAILED"),
        gte(auditLog.createdAt, windowStart),
      ),
    )
    .limit(1);
  if (recentFailures >= IDENTITY_ATTEMPT_LIMIT) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again in 15 minutes." },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = authorityIdentityConfirmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Enter a valid email address" },
      { status: 400 },
    );
  }

  const [authority] = await db
    .select({ email: recommendingAuthorities.email })
    .from(recommendingAuthorities)
    .where(eq(recommendingAuthorities.id, advice.recommendingAuthorityId))
    .limit(1);

  if (!authority?.email) {
    return NextResponse.json(
      {
        error:
          "Identity confirmation isn't available for this approval right now. Please contact the Accounts department.",
      },
      { status: 503 },
    );
  }

  if (!emailsMatch(parsed.data.email, authority.email)) {
    await db.insert(auditLog).values({
      paymentAdviceId: advice.id,
      action: "AUTHORITY_IDENTITY_CHECK_FAILED",
      actor: "Unverified visitor",
      ipAddress: clientIp(req),
      details: { attemptedEmail: parsed.data.email },
    });
    return NextResponse.json(
      { error: "That email doesn't match our records for this approval." },
      { status: 401 },
    );
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(identityCookieName(token), "1", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    // No maxAge/expires set deliberately — a true session cookie, cleared
    // when the browser closes, matching "remember it for that browser
    // session" rather than persisting indefinitely.
  });
  return res;
}
