import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { paymentAdvices } from "@/lib/db/schema";
import { getAdminSession } from "@/lib/admin-session";
import { authorityActionError } from "@/lib/advice/authority-token";
import { performAuthorityApproval } from "@/lib/advice/authority-actions";

function clientIp(req: NextRequest) { return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null; }

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (session?.adminRole !== "AUTHORITY" || !session.recommendingAuthorityId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const [advice] = await db.select({ id: paymentAdvices.id, authorityApprovedAt: paymentAdvices.authorityApprovedAt, authorityRejectedAt: paymentAdvices.authorityRejectedAt, authorityTokenExpiresAt: paymentAdvices.authorityTokenExpiresAt }).from(paymentAdvices).where(and(eq(paymentAdvices.id, id), eq(paymentAdvices.recommendingAuthorityId, session.recommendingAuthorityId))).limit(1);
  if (!advice) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const actionError = authorityActionError(advice);
  if (actionError) return NextResponse.json({ error: actionError }, { status: 409 });
  const approvedAt = await performAuthorityApproval({ advice, actor: session.fullName, ipAddress: clientIp(req) });
  return NextResponse.json({ ok: true, approvedAt: approvedAt.toISOString() });
}
