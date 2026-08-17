import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { paymentAdvices, paymentEntries, auditLog } from "@/lib/db/schema";
import { paymentEntrySchema } from "@/lib/validation/payment-advice";
import { billPassedForLabelFor, displayNoFor, documentLabelFor } from "@/lib/advice/document-identity";
import { getAdminSession } from "@/lib/admin-session";
import { notifyPaymentEntry } from "@/lib/email/notify";

export const runtime = "nodejs";

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

function money(value: number): string {
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2 });
}

type TxResult =
  | { ok: false; status: number; error: string }
  | {
      ok: true;
      totalPaid: string;
      remaining: string;
      billPassedFor: string;
      isFinal: boolean;
      paidAt: Date;
    };

/**
 * "Record a Payment" — replaces the old single "Mark Payment Done" action
 * for NEFT only (see AGENT_HANDOFF.md). Cash Voucher's
 * POST .../payment-done route is completely untouched and still handles
 * Cash's one-shot terminal action exactly as before.
 *
 * Every entry is capped against `bill_passed_for` minus the sum of all
 * prior entries — never the raw Basic+GST Total — since bill_passed_for is
 * already the field where Finance confirms the actual payable amount
 * before finalizing payment. The cap check happens inside a
 * `SELECT ... FOR UPDATE`-locked transaction (same pattern lib/serial.ts
 * uses for gapless numbering) so two concurrent "Record a Payment" submits
 * against the same advice can never both pass a stale remaining-balance
 * check and together overpay it.
 *
 * `total_paid` is a cached running total (not a live SUM()), updated
 * atomically in the same transaction as the insert. The entry that brings
 * total_paid to (or past) bill_passed_for performs the same
 * status/approved_at/approved_by_name dual-write the old single Payment
 * Done action used to — partial entries never touch those fields.
 */
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
      paymentMode: paymentAdvices.paymentMode,
      serialNo: paymentAdvices.serialNo,
      cashVoucherNo: paymentAdvices.cashVoucherNo,
      isAdvance: paymentAdvices.isAdvance,
      advanceNo: paymentAdvices.advanceNo,
      submittedByName: paymentAdvices.submittedByName,
      submittedByEmail: paymentAdvices.submittedByEmail,
      payeeName: paymentAdvices.payeeName,
      formDate: paymentAdvices.formDate,
      verifiedAt: paymentAdvices.verifiedAt,
    })
    .from(paymentAdvices)
    .where(eq(paymentAdvices.id, id))
    .limit(1);
  if (!advice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (advice.paymentMode !== "NEFT") {
    return NextResponse.json(
      { error: "Record a Payment is only available for NEFT Payment Advices." },
      { status: 409 },
    );
  }
  if (!advice.verifiedAt) {
    return NextResponse.json(
      { error: "Must be verified before recording a payment." },
      { status: 409 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = paymentEntrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid data" },
      { status: 400 },
    );
  }

  const paidBy = session.fullName;
  const now = new Date();
  const amountPaise = Math.round(parsed.data.amount * 100);

  const result: TxResult = await db.transaction(async (tx) => {
    const rows = await tx.execute<{
      bill_passed_for: string | null;
      total_paid: string;
      status: string;
    }>(sql`
      select bill_passed_for, total_paid, status
      from payment_advices
      where id = ${id}
      for update
    `);
    const row = rows.rows[0];
    if (!row) {
      return { ok: false, status: 404, error: "Not found" };
    }
    if (row.status === "APPROVED") {
      return { ok: false, status: 409, error: "This advice is already fully settled." };
    }
    if (!row.bill_passed_for) {
      return {
        ok: false,
        status: 400,
        error: `${billPassedForLabelFor(advice.isAdvance)} must be saved before recording a payment.`,
      };
    }

    const billPassedForPaise = Math.round(Number(row.bill_passed_for) * 100);
    const totalPaidPaise = Math.round(Number(row.total_paid) * 100);
    const remainingPaise = billPassedForPaise - totalPaidPaise;
    if (amountPaise > remainingPaise) {
      return {
        ok: false,
        status: 400,
        error: `Amount exceeds the remaining balance of ₹ ${money(remainingPaise / 100)}.`,
      };
    }

    const newTotalPaidPaise = totalPaidPaise + amountPaise;
    const newTotalPaid = (newTotalPaidPaise / 100).toFixed(2);
    const isFinal = newTotalPaidPaise >= billPassedForPaise;

    await tx.insert(paymentEntries).values({
      paymentAdviceId: id,
      amount: parsed.data.amount.toFixed(2),
      remarks: parsed.data.remarks,
      paidAt: now,
      paidBy,
    });

    await tx
      .update(paymentAdvices)
      .set({
        totalPaid: newTotalPaid,
        updatedAt: now,
        ...(isFinal
          ? { status: "APPROVED" as const, approvedAt: now, approvedByName: paidBy }
          : {}),
      })
      .where(eq(paymentAdvices.id, id));

    await tx.insert(auditLog).values({
      paymentAdviceId: id,
      action: "PAYMENT_ENTRY_RECORDED",
      actor: paidBy,
      ipAddress: clientIp(req),
      details: {
        amount: parsed.data.amount,
        remarks: parsed.data.remarks,
        totalPaid: newTotalPaid,
        billPassedFor: row.bill_passed_for,
        isFinal,
      },
    });

    return {
      ok: true,
      totalPaid: newTotalPaid,
      remaining: ((billPassedForPaise - newTotalPaidPaise) / 100).toFixed(2),
      billPassedFor: row.bill_passed_for,
      isFinal,
      paidAt: now,
    };
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  await notifyPaymentEntry(
    {
      displayNo: displayNoFor(
        "NEFT",
        advice.serialNo,
        advice.cashVoucherNo,
        advice.isAdvance,
        advice.advanceNo,
      ),
      submittedByName: advice.submittedByName,
      documentLabel: documentLabelFor("NEFT", advice.isAdvance),
      payeeName: advice.payeeName,
      entryAmount: money(parsed.data.amount),
      remarks: parsed.data.remarks,
      isFinal: result.isFinal,
      totalPaid: money(Number(result.totalPaid)),
      billPassedFor: money(Number(result.billPassedFor)),
      remaining: money(Number(result.remaining)),
      formDate: advice.formDate,
    },
    advice.submittedByEmail,
    id,
  );

  return NextResponse.json({
    ok: true,
    totalPaid: result.totalPaid,
    remaining: result.remaining,
    isFinal: result.isFinal,
    paidAt: result.paidAt.toISOString(),
  });
}
