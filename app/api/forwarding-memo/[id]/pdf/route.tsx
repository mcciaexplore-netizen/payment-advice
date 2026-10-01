import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog, forwardingMemos } from "@/lib/db/schema";
import { renderForwardingMemoPdf } from "@/lib/pdf/render-forwarding-memo";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const [memo] = await db.select().from(forwardingMemos).where(eq(forwardingMemos.id, id)).limit(1);
  if (!memo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const buffer = await renderForwardingMemoPdf(
    {
      memoDate: memo.memoDate,
      partyName: memo.partyName,
      partyAddress: memo.partyAddress,
      purpose: memo.purpose,
      billNo: memo.billNo ?? undefined,
      billDate: memo.billDate ?? undefined,
      instrumentMode: memo.instrumentMode as "CHEQUE" | "DD",
      instrumentNo: memo.instrumentNo,
      instrumentDate: memo.instrumentDate,
      drawnOnBank: memo.drawnOnBank,
      amount: Number(memo.amount),
      submittedByName: memo.submittedByName,
      submittedByEmail: memo.submittedByEmail ?? undefined,
    },
    {
      serialNo: memo.serialNo,
      receivedAt: memo.receivedAt?.toISOString() ?? null,
      receivedBy: memo.receivedBy,
    },
  );

  await db.insert(auditLog).values({
    forwardingMemoId: memo.id,
    action: "FORWARDING_MEMO_PDF_GENERATED",
    actor: memo.submittedByName,
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    details: { serialNo: memo.serialNo, source: "public" },
  });

  const download = new URL(req.url).searchParams.get("download") === "1";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="forwarding-memo-${memo.id}.pdf"`,
    },
  });
}
