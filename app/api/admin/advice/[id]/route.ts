import { NextRequest, NextResponse } from "next/server";
import { count, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { auditLog, paymentAdvices, paymentEntries } from "@/lib/db/schema";
import { billPassedForSchema, payableCalculatorSchema } from "@/lib/validation/payment-advice";
import { calculatePayable } from "@/lib/advice/payment-calculator";
import { getAdminSession } from "@/lib/admin-session";

export const runtime = "nodejs";

const cashVoucherPatchSchema = z.object({ billPassedFor: z.number() });

function canManageSubmission(roles: string[], paymentMode: string): boolean {
  return roles.includes("ALL") ||
    (paymentMode === "NEFT" ? roles.includes("PAYMENT_ADVICE") : roles.includes("CASH_VOUCHER"));
}

/** Saves Finance's payable calculation for Payment Advice/Advance. Regular
 * Cash Voucher keeps its existing Bill Passed For behavior in the narrow
 * legacy branch below and is otherwise completely unaffected. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const [advice] = await db
    .select({
      status: paymentAdvices.status,
      paymentMode: paymentAdvices.paymentMode,
      amount: paymentAdvices.amount,
      basicAmount: paymentAdvices.basicAmount,
      isAdvance: paymentAdvices.isAdvance,
      verifiedAt: paymentAdvices.verifiedAt,
    })
    .from(paymentAdvices)
    .where(eq(paymentAdvices.id, id))
    .limit(1);
  if (!advice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);

  // Regular Cash Voucher: preserve the existing field and save contract.
  // Advance is deliberately excluded even when its payment mode is CASH.
  if (advice.paymentMode === "CASH" && !advice.isAdvance) {
    const parsed = cashVoucherPatchSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    if (advice.status === "APPROVED") {
      return NextResponse.json(
        { error: "This Cash Voucher is already paid and can no longer be edited." },
        { status: 409 },
      );
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

  if (!canManageSubmission(session.roles, advice.paymentMode)) {
    return NextResponse.json(
      { error: "Your account cannot manage Payment Advice payments." },
      { status: 403 },
    );
  }
  if (!advice.verifiedAt) {
    return NextResponse.json(
      { error: "Verify this submission before saving its payable calculation." },
      { status: 409 },
    );
  }

  const parsed = payableCalculatorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid calculator data" },
      { status: 400 },
    );
  }

  const result = await db.transaction(async (tx) => {
    const locked = await tx.execute<{
      status: string;
      payment_mode: string;
      is_advance: boolean;
      amount: string;
      basic_amount: string | null;
    }>(sql`
      select status, payment_mode, is_advance, amount, basic_amount
      from payment_advices
      where id = ${id}
      for update
    `);
    const row = locked.rows[0];
    if (!row) return { ok: false as const, status: 404, error: "Not found" };
    if (row.status === "APPROVED") {
      return {
        ok: false as const,
        status: 409,
        error: "This submission is already fully paid; its calculation is read-only.",
      };
    }
    if (row.status !== "SUBMITTED") {
      return {
        ok: false as const,
        status: 409,
        error: "The payable calculation is unavailable while this submission is not active.",
      };
    }

    const [{ count: entryCount }] = await tx
      .select({ count: count() })
      .from(paymentEntries)
      .where(eq(paymentEntries.paymentAdviceId, id));
    if (entryCount > 0) {
      return {
        ok: false as const,
        status: 409,
        error: "The payable calculation is locked once a payment has been recorded.",
      };
    }

    const basicAmount = row.is_advance ? Number(row.amount) : Number(row.basic_amount);
    if (!Number.isFinite(basicAmount) || basicAmount <= 0) {
      return {
        ok: false as const,
        status: 409,
        error: "Basic Amount is unavailable for this submission; contact Accounts before paying it.",
      };
    }

    const calculation = calculatePayable({
      basicAmount,
      arrearsAmount: parsed.data.arrearsAmount,
      currentTdsPercent: parsed.data.currentTdsPercent,
    });
    if (calculation.payableAmount <= 0) {
      return {
        ok: false as const,
        status: 400,
        error: "The calculated Payable Amount must be greater than 0.",
      };
    }

    const now = new Date();
    const arrearsAmount = parsed.data.arrearsAmount ?? 0;
    await tx
      .update(paymentAdvices)
      .set({
        arrearsAmount: arrearsAmount.toFixed(2),
        // Kept as a compatibility mirror for the additive 0021 schema: the
        // calculator now has one shared rate and can no longer persist a
        // different Arrears TDS percentage.
        arrearsTdsPercent: parsed.data.currentTdsPercent.toFixed(2),
        currentTdsPercent: parsed.data.currentTdsPercent.toFixed(2),
        payableAmount: calculation.payableAmount.toFixed(2),
        updatedAt: now,
      })
      .where(eq(paymentAdvices.id, id));
    await tx.insert(auditLog).values({
      paymentAdviceId: id,
      action: "PAYABLE_CALCULATION_SAVED",
      actor: session.fullName,
      details: {
        arrearsAmount,
        arrearsTdsPercent: parsed.data.currentTdsPercent,
        currentTdsPercent: parsed.data.currentTdsPercent,
        payableAmount: calculation.payableAmount,
      },
    });

    return {
      ok: true as const,
      payableAmount: calculation.payableAmount.toFixed(2),
      arrearsTdsAmount: calculation.arrearsTdsAmount.toFixed(2),
      currentTdsAmount: calculation.currentTdsAmount.toFixed(2),
      totalTdsAmount: calculation.totalTdsAmount.toFixed(2),
    };
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
