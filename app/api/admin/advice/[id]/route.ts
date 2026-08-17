import { NextRequest, NextResponse } from "next/server";
import { count, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { paymentAdvices, paymentEntries } from "@/lib/db/schema";
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
  // Once Finance has recorded at least one payment entry against this
  // advice (NEFT's multi-part payment model — see AGENT_HANDOFF.md),
  // "Bill passed for Rs." becomes the fixed cap those entries were measured
  // against; changing it after the fact could put total_paid above (or
  // below, confusingly) a cap that already governed real money already
  // paid out. Cash Voucher never records payment_entries, so this never
  // affects Cash rows.
  const [{ count: existingEntryCount }] = await db
    .select({ count: count() })
    .from(paymentEntries)
    .where(eq(paymentEntries.paymentAdviceId, id));
  if (existingEntryCount > 0) {
    return NextResponse.json(
      {
        error:
          "Bill passed for Rs. is locked once a payment has been recorded against this advice.",
      },
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
