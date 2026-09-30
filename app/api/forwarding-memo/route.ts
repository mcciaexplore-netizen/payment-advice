import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auditLog, forwardingMemos } from "@/lib/db/schema";
import { forwardingMemoSchema } from "@/lib/validation/forwarding-memo";
import { todayInIst } from "@/lib/date-time";

export const runtime = "nodejs";

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export async function POST(req: NextRequest) {
  if (process.env.FORWARDING_MEMO_LOCAL_TEST !== "true") {
    return NextResponse.json({ error: "Forwarding Memo submissions are not enabled." }, { status: 404 });
  }

  const parsed = forwardingMemoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid forwarding memo data." },
      { status: 400 },
    );
  }

  const values = { ...parsed.data, memoDate: todayInIst() };
  try {
    const [memo] = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(forwardingMemos)
        .values({
          ...values,
          amount: values.amount.toFixed(2),
        })
        .returning({ id: forwardingMemos.id, createdAt: forwardingMemos.createdAt });

      await tx.insert(auditLog).values({
        forwardingMemoId: created.id,
        action: "FORWARDING_MEMO_SUBMITTED",
        actor: values.submittedByName,
        ipAddress: clientIp(req),
        details: {},
      });

      return [created] as const;
    });

    return NextResponse.json({ ok: true, id: memo.id, createdAt: memo.createdAt });
  } catch (error) {
    console.error("[Forwarding Memo] database submission failed", error);
    return NextResponse.json(
      { error: "The development database is unavailable. Check DATABASE_URL and Neon credentials." },
      { status: 503 },
    );
  }
}
