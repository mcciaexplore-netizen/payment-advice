import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { paymentAdvices, recommendingAuthorities } from "@/lib/db/schema";
import { getAdminSession } from "@/lib/admin-session";
import { hasRole } from "@/lib/auth";
import { performFinalReject } from "@/lib/advice/reject";
import { rejectSubmissionSchema } from "@/lib/validation/payment-advice";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session || !hasRole(session, "AUTHORITY") || !session.recommendingAuthorityId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [authority] = await db.select({ name: recommendingAuthorities.authorityName }).from(recommendingAuthorities).where(eq(recommendingAuthorities.id, session.recommendingAuthorityId)).limit(1);
  if (authority?.name.trim().toUpperCase() === "DG") return NextResponse.json({ error: "DG Executive Dashboard is read-only." }, { status: 403 });
  const parsed = rejectSubmissionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Remarks are required" }, { status: 400 });
  const { id } = await params;
  const [advice] = await db.select({ id: paymentAdvices.id, serialNo: paymentAdvices.serialNo, cashVoucherNo: paymentAdvices.cashVoucherNo, advanceNo: paymentAdvices.advanceNo, isAdvance: paymentAdvices.isAdvance, paymentMode: paymentAdvices.paymentMode, submittedByName: paymentAdvices.submittedByName, submittedByEmail: paymentAdvices.submittedByEmail, payeeName: paymentAdvices.payeeName, amount: paymentAdvices.amount }).from(paymentAdvices).where(and(eq(paymentAdvices.id, id), eq(paymentAdvices.recommendingAuthorityId, session.recommendingAuthorityId))).limit(1);
  if (!advice) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const rejectedAt = await performFinalReject({ advice, actor: session.fullName, remarks: parsed.data.remarks, ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null });
  if (!rejectedAt) return NextResponse.json({ error: "This submission cannot be rejected because it is already closed or has a payment recorded." }, { status: 409 });
  return NextResponse.json({ ok: true, rejectedAt: rejectedAt.toISOString() });
}
