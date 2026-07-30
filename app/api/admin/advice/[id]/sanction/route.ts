import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { paymentAdvices, auditLog } from "@/lib/db/schema";
import { billPassedForSchema, sanctionSchema, sanctionerNameCorrectionSchema } from "@/lib/validation/payment-advice";

export const runtime = "nodejs";

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/**
 * Step 3, the final gate: Finance sanctions, picking a name from the fixed
 * 2-person list. This is the new terminal action — it folds in what the old
 * free-text "Approve" button used to do, dual-writing `approvedAt` /
 * `approvedByName` (and setting `status` to APPROVED) so every existing
 * reader of those fields — Excel export, the Payment Advice PDF header, the
 * admin-gated PDF routes — keeps working unchanged. See AGENT_HANDOFF.md.
 */
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
      verifiedAt: paymentAdvices.verifiedAt,
      sanctionedAt: paymentAdvices.sanctionedAt,
    })
    .from(paymentAdvices)
    .where(eq(paymentAdvices.id, id))
    .limit(1);
  if (!advice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!advice.verifiedAt) {
    return NextResponse.json(
      { error: "Must be verified before it can be sanctioned." },
      { status: 409 },
    );
  }
  if (advice.sanctionedAt || advice.status === "APPROVED") {
    return NextResponse.json({ error: "Already sanctioned." }, { status: 409 });
  }

  const body = await req.json().catch(() => null);

  const billPassedForInput =
    typeof (body as { billPassedFor?: unknown })?.billPassedFor === "number"
      ? (body as { billPassedFor: number }).billPassedFor
      : advice.billPassedFor
        ? Number(advice.billPassedFor)
        : undefined;
  if (billPassedForInput === undefined) {
    return NextResponse.json(
      { error: "Bill passed for Rs. must be filled before sanctioning." },
      { status: 400 },
    );
  }

  const parsed = sanctionSchema.safeParse({
    sanctionedBy: (body as { sanctionedBy?: unknown })?.sanctionedBy,
    billPassedFor: billPassedForInput,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid data" },
      { status: 400 },
    );
  }

  const amountCheck = billPassedForSchema(Number(advice.amount)).safeParse(
    parsed.data.billPassedFor,
  );
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
        sanctionedAt: now,
        sanctionedBy: parsed.data.sanctionedBy,
        billPassedFor: amountCheck.data.toFixed(2),
        status: "APPROVED",
        approvedAt: now,
        approvedByName: parsed.data.sanctionedBy,
        updatedAt: now,
      })
      .where(eq(paymentAdvices.id, id));

    await tx.insert(auditLog).values({
      paymentAdviceId: id,
      action: "SANCTIONED",
      actor: parsed.data.sanctionedBy,
      ipAddress: clientIp(req),
      details: { sanctionedBy: parsed.data.sanctionedBy, billPassedFor: parsed.data.billPassedFor },
    });
  });

  return NextResponse.json({ ok: true });
}

/**
 * Narrow correction path (not general undo/reverse): fixes ONLY
 * `sanctioned_by` when the wrong name was picked from the 2-person list.
 * `sanctioned_at`/`billPassedFor`/`status` are deliberately left untouched.
 *
 * Also corrects `approved_by_name` alongside `sanctioned_by` — flagging this
 * explicitly since it's a second column: the original Sanction action
 * dual-writes `approved_by_name = sanctionedBy` specifically so the Payment
 * Advice PDF header and Excel export (which both still read `approved_by_name`,
 * not `sanctioned_by`) show the correct name. Leaving `approved_by_name`
 * stale after a correction would mean the wrong name keeps printing on the
 * actual document even though the "corrected" pipeline field is right —
 * treating it as the same underlying fact (who sanctioned it), not "another
 * field," per AGENT_HANDOFF.md's documented dual-write reasoning.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [advice] = await db
    .select({ sanctionedAt: paymentAdvices.sanctionedAt, sanctionedBy: paymentAdvices.sanctionedBy })
    .from(paymentAdvices)
    .where(eq(paymentAdvices.id, id))
    .limit(1);
  if (!advice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!advice.sanctionedAt) {
    return NextResponse.json(
      { error: "Not yet sanctioned — nothing to correct." },
      { status: 409 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = sanctionerNameCorrectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid data" },
      { status: 400 },
    );
  }

  const oldSanctionedBy = advice.sanctionedBy;
  const newSanctionedBy = parsed.data.sanctionedBy;
  if (oldSanctionedBy === newSanctionedBy) {
    return NextResponse.json({ error: "That's already the recorded name." }, { status: 409 });
  }

  await db.transaction(async (tx) => {
    await tx
      .update(paymentAdvices)
      .set({ sanctionedBy: newSanctionedBy, approvedByName: newSanctionedBy, updatedAt: new Date() })
      .where(eq(paymentAdvices.id, id));

    await tx.insert(auditLog).values({
      paymentAdviceId: id,
      action: "SANCTIONER_NAME_CORRECTED",
      actor: "ADMIN",
      ipAddress: clientIp(req),
      details: { oldSanctionedBy, newSanctionedBy },
    });
  });

  return NextResponse.json({ ok: true, sanctionedBy: newSanctionedBy });
}
