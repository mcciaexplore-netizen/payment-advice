import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { paymentAdvices, auditLog } from "@/lib/db/schema";
import { approveSchema, billPassedForSchema } from "@/lib/validation/payment-advice";

export const runtime = "nodejs";

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [advice] = await db
    .select({
      status: paymentAdvices.status,
      amount: paymentAdvices.amount,
      billPassedFor: paymentAdvices.billPassedFor,
      authorityApprovedAt: paymentAdvices.authorityApprovedAt,
    })
    .from(paymentAdvices)
    .where(eq(paymentAdvices.id, id))
    .limit(1);
  if (!advice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (advice.status === "APPROVED") {
    return NextResponse.json({ error: "Already approved." }, { status: 409 });
  }
  if (!advice.authorityApprovedAt) {
    return NextResponse.json(
      { error: "Awaiting Recommending Authority approval before Admin can approve." },
      { status: 409 },
    );
  }

  const body = await req.json().catch(() => null);

  const billPassedForInput =
    typeof body?.billPassedFor === "number" ? body.billPassedFor : advice.billPassedFor ? Number(advice.billPassedFor) : undefined;

  if (billPassedForInput === undefined) {
    return NextResponse.json(
      { error: "Bill passed for Rs. must be filled before approving." },
      { status: 400 },
    );
  }

  const parsed = approveSchema.safeParse({
    approvedByName: body?.approvedByName,
    billPassedFor: billPassedForInput,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid data" },
      { status: 400 },
    );
  }

  const amountCheck = billPassedForSchema(Number(advice.amount)).safeParse(parsed.data.billPassedFor);
  if (!amountCheck.success) {
    return NextResponse.json(
      { error: amountCheck.error.issues[0]?.message ?? "Invalid amount" },
      { status: 400 },
    );
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(paymentAdvices)
      .set({
        status: "APPROVED",
        approvedAt: now,
        approvedByName: parsed.data.approvedByName,
        billPassedFor: amountCheck.data.toFixed(2),
        updatedAt: now,
      })
      .where(eq(paymentAdvices.id, id));

    await tx.insert(auditLog).values({
      paymentAdviceId: id,
      action: "APPROVED",
      actor: "ADMIN",
      ipAddress: clientIp(req),
      details: { approvedByName: parsed.data.approvedByName },
    });
  });

  return NextResponse.json({ ok: true });
}
