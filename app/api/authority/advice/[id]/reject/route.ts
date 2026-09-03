import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { paymentAdvices } from "@/lib/db/schema";
import { getAdminSession } from "@/lib/admin-session";
import { authorityActionError } from "@/lib/advice/authority-token";
import { performAuthorityRejection } from "@/lib/advice/authority-actions";
import { authorityRejectSchema } from "@/lib/validation/payment-advice";

function clientIp(req: NextRequest) { return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null; }

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (session?.adminRole !== "AUTHORITY" || !session.recommendingAuthorityId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const [advice] = await db.select({ id: paymentAdvices.id, serialNo: paymentAdvices.serialNo, cashVoucherNo: paymentAdvices.cashVoucherNo, advanceNo: paymentAdvices.advanceNo, isAdvance: paymentAdvices.isAdvance, paymentMode: paymentAdvices.paymentMode, submittedByName: paymentAdvices.submittedByName, submittedByEmail: paymentAdvices.submittedByEmail, payeeName: paymentAdvices.payeeName, amount: paymentAdvices.amount, authorityApprovedAt: paymentAdvices.authorityApprovedAt, authorityRejectedAt: paymentAdvices.authorityRejectedAt, authorityTokenExpiresAt: paymentAdvices.authorityTokenExpiresAt }).from(paymentAdvices).where(and(eq(paymentAdvices.id, id), eq(paymentAdvices.recommendingAuthorityId, session.recommendingAuthorityId))).limit(1);
  if (!advice) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const actionError = authorityActionError(advice);
  if (actionError) return NextResponse.json({ error: actionError }, { status: 409 });
  const parsed = authorityRejectSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Remarks are required" }, { status: 400 });
  await performAuthorityRejection({ advice, actor: session.fullName, remarks: parsed.data.remarks, ipAddress: clientIp(req), origin: new URL(req.url).origin });
  return NextResponse.json({ ok: true });
}
