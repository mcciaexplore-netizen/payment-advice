import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { paymentAdvices, auditLog } from "@/lib/db/schema";
import { notifyVerified } from "@/lib/email/notify";
import { PaymentMode, verifierNameCorrectionSchema } from "@/lib/validation/payment-advice";
import { displayNoFor, documentLabelFor } from "@/lib/advice/document-identity";
import { getAdminSession } from "@/lib/admin-session";

export const runtime = "nodejs";

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/** Step 2: Finance verifies. `verified_by` is auto-attributed from the
 * logged-in Admin's session (real per-person login, admin_users) — no
 * picker, no request body needed. Notifies the submitter — see
 * AGENT_HANDOFF.md for why Received deliberately does not send an email,
 * and for why Sanctioned no longer exists as an active step at all. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const [advice] = await db
    .select({
      serialNo: paymentAdvices.serialNo,
      cashVoucherNo: paymentAdvices.cashVoucherNo,
      submittedByName: paymentAdvices.submittedByName,
      submittedByEmail: paymentAdvices.submittedByEmail,
      payeeName: paymentAdvices.payeeName,
      amount: paymentAdvices.amount,
      formDate: paymentAdvices.formDate,
      paymentMode: paymentAdvices.paymentMode,
      financeReceivedAt: paymentAdvices.financeReceivedAt,
      verifiedAt: paymentAdvices.verifiedAt,
    })
    .from(paymentAdvices)
    .where(eq(paymentAdvices.id, id))
    .limit(1);
  if (!advice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!advice.financeReceivedAt) {
    return NextResponse.json(
      { error: "Must be marked Received & In Process before it can be verified." },
      { status: 409 },
    );
  }
  if (advice.verifiedAt) {
    return NextResponse.json({ error: "Already verified." }, { status: 409 });
  }

  const verifiedBy = session.fullName;
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(paymentAdvices)
      .set({ verifiedAt: now, verifiedBy, updatedAt: now })
      .where(eq(paymentAdvices.id, id));

    await tx.insert(auditLog).values({
      paymentAdviceId: id,
      action: "VERIFIED",
      actor: verifiedBy,
      ipAddress: clientIp(req),
      details: { verifiedBy },
    });
  });

  await notifyVerified(
    {
      displayNo: displayNoFor(advice.paymentMode as PaymentMode, advice.serialNo, advice.cashVoucherNo),
      submittedByName: advice.submittedByName,
      verifiedBy,
      documentLabel: documentLabelFor(advice.paymentMode as PaymentMode),
      payeeName: advice.payeeName,
      amount: Number(advice.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 }),
      formDate: advice.formDate,
    },
    advice.submittedByEmail,
    id,
  );

  return NextResponse.json({ ok: true, verifiedAt: now.toISOString() });
}

/**
 * Narrow correction path (not general undo/reverse): fixes ONLY `verified_by`
 * when the wrong name was picked from the 4-person list. `verified_at` is
 * deliberately left untouched — it already correctly captured when
 * verification happened, regardless of which name got recorded. Does not
 * re-fire `notifyVerified()`; the submitter was already correctly notified
 * that their advice was verified at the time it actually was.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [advice] = await db
    .select({ verifiedAt: paymentAdvices.verifiedAt, verifiedBy: paymentAdvices.verifiedBy })
    .from(paymentAdvices)
    .where(eq(paymentAdvices.id, id))
    .limit(1);
  if (!advice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!advice.verifiedAt) {
    return NextResponse.json(
      { error: "Not yet verified — nothing to correct." },
      { status: 409 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = verifierNameCorrectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid data" },
      { status: 400 },
    );
  }

  const oldVerifiedBy = advice.verifiedBy;
  const newVerifiedBy = parsed.data.verifiedBy;
  if (oldVerifiedBy === newVerifiedBy) {
    return NextResponse.json({ error: "That's already the recorded name." }, { status: 409 });
  }

  await db.transaction(async (tx) => {
    await tx
      .update(paymentAdvices)
      .set({ verifiedBy: newVerifiedBy, updatedAt: new Date() })
      .where(eq(paymentAdvices.id, id));

    await tx.insert(auditLog).values({
      paymentAdviceId: id,
      action: "VERIFIER_NAME_CORRECTED",
      actor: "ADMIN",
      ipAddress: clientIp(req),
      details: { oldVerifiedBy, newVerifiedBy },
    });
  });

  return NextResponse.json({ ok: true, verifiedBy: newVerifiedBy });
}
