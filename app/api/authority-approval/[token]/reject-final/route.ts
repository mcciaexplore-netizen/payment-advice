import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { paymentAdvices, recommendingAuthorities } from "@/lib/db/schema";
import { performFinalReject } from "@/lib/advice/reject";
import { rejectSubmissionSchema } from "@/lib/validation/payment-advice";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const parsed = rejectSubmissionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Remarks are required" }, { status: 400 });
  const [row] = await db.select({
    id: paymentAdvices.id, serialNo: paymentAdvices.serialNo, cashVoucherNo: paymentAdvices.cashVoucherNo,
    advanceNo: paymentAdvices.advanceNo, isAdvance: paymentAdvices.isAdvance, paymentMode: paymentAdvices.paymentMode,
    submittedByName: paymentAdvices.submittedByName, submittedByEmail: paymentAdvices.submittedByEmail,
    payeeName: paymentAdvices.payeeName, amount: paymentAdvices.amount,
    authorityName: recommendingAuthorities.authorityName,
  }).from(paymentAdvices).leftJoin(recommendingAuthorities, eq(paymentAdvices.recommendingAuthorityId, recommendingAuthorities.id))
    .where(eq(paymentAdvices.authorityToken, token)).limit(1);
  if (!row) return NextResponse.json({ error: "This recommendation link is not valid." }, { status: 404 });
  if (row.authorityName?.trim().toUpperCase() === "DG") return NextResponse.json({ error: "DG Executive Dashboard is read-only." }, { status: 403 });
  const rejectedAt = await performFinalReject({ advice: row, actor: row.authorityName ?? "Recommending Authority", remarks: parsed.data.remarks, ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null });
  if (!rejectedAt) return NextResponse.json({ error: "This submission cannot be rejected because it is already closed or has a payment recorded." }, { status: 409 });
  return NextResponse.json({ ok: true, rejectedAt: rejectedAt.toISOString() });
}
