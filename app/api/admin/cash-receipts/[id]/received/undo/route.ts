import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin-session";
import { canUndoCashReceiptReceived, undoCashReceiptReceived, undoReceivedSchema } from "@/lib/cash-receipts/received";

export const runtime = "nodejs";

const clientIp = (req: NextRequest) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

/** Undoes "Cash received". Role ALL only, a reason is required, and the
 * undo is audit logged (CASH_RECEIPT_RECEIVED_UNDONE). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUndoCashReceiptReceived(session)) return NextResponse.json({ error: "Only Finance users with All access can undo." }, { status: 403 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = undoReceivedSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });

  const result = await undoCashReceiptReceived({ id, reason: parsed.data.reason, actor: session.fullName, ip: clientIp(req) });
  if (result.status === "not-received") return NextResponse.json({ error: "This receipt is not marked received." }, { status: 409 });
  return NextResponse.json({ ok: true, serialNo: result.serialNo });
}
