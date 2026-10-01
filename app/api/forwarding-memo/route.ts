import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auditLog, forwardingMemos } from "@/lib/db/schema";
import { forwardingMemoSchema } from "@/lib/validation/forwarding-memo";
import { todayInIst } from "@/lib/date-time";
import { allocateForwardingMemoNumber, financialYearFor } from "@/lib/serial";

export const runtime = "nodejs";

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export async function POST(req: NextRequest) {
  const parsed = forwardingMemoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid forwarding memo data." },
      { status: 400 },
    );
  }

  // Memo Date is system-controlled, same as Payment Advice's formDate - a
  // client-supplied date is never trusted for the record that actually gets
  // numbered/saved, regardless of what the (read-only) form field showed.
  const now = new Date();
  const values = { ...parsed.data, memoDate: todayInIst(now) };

  try {
    const { memo } = await db.transaction(async (tx) => {
      const financialYear = financialYearFor(now);
      const serialNo = await allocateForwardingMemoNumber(tx, financialYear);

      // Allocation and row creation deliberately share this transaction -
      // if the insert below fails, the counter rolls back with it, same
      // gapless-but-never-wasted-on-a-failed-write guarantee as the other
      // three series.
      const [created] = await tx
        .insert(forwardingMemos)
        .values({
          ...values,
          serialNo,
          financialYear,
          amount: values.amount.toFixed(2),
        })
        .returning({ id: forwardingMemos.id, serialNo: forwardingMemos.serialNo, createdAt: forwardingMemos.createdAt });

      await tx.insert(auditLog).values({
        forwardingMemoId: created.id,
        action: "FORWARDING_MEMO_SUBMITTED",
        actor: values.submittedByName,
        ipAddress: clientIp(req),
        details: { serialNo: created.serialNo },
      });

      return { memo: created };
    });

    return NextResponse.json({ ok: true, id: memo.id, serialNo: memo.serialNo, createdAt: memo.createdAt });
  } catch (error) {
    console.error("[Forwarding Memo] database submission failed", error);
    return NextResponse.json(
      { error: "Something went wrong while submitting. Please try again." },
      { status: 503 },
    );
  }
}
