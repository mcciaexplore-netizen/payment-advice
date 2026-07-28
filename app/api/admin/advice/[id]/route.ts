import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { paymentAdvices } from "@/lib/db/schema";
import { billPassedForSchema } from "@/lib/validation/payment-advice";

export const runtime = "nodejs";

const patchSchema = z.object({ billPassedFor: z.number() });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [advice] = await db
    .select({ status: paymentAdvices.status, amount: paymentAdvices.amount })
    .from(paymentAdvices)
    .where(eq(paymentAdvices.id, id))
    .limit(1);
  if (!advice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (advice.status === "APPROVED") {
    return NextResponse.json(
      { error: "This Payment Advice is already approved and can no longer be edited." },
      { status: 409 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  const check = billPassedForSchema(Number(advice.amount)).safeParse(parsed.data.billPassedFor);
  if (!check.success) {
    return NextResponse.json(
      { error: check.error.issues[0]?.message ?? "Invalid amount" },
      { status: 400 },
    );
  }

  await db
    .update(paymentAdvices)
    .set({ billPassedFor: check.data.toFixed(2), updatedAt: new Date() })
    .where(eq(paymentAdvices.id, id));

  return NextResponse.json({ ok: true });
}
