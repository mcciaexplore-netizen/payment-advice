import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { canMarkCashReceiptReceived, markCashReceiptsReceived, markReceivedSchema } from "@/lib/cash-receipts/received";

export const runtime = "nodejs";

const clientIp = (req: NextRequest) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

/** Marks one or many Cash Receipts as "Cash received". proxy.ts already
 * limits /api/admin/* to Finance; this narrows it to ALL and CASH_VOUCHER.
 * Body: { ids, note? }. Time and user come from the server, never the body. */
export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canMarkCashReceiptReceived(session)) {
    return NextResponse.json({ error: "Only Finance users with Cash Voucher or All access can mark cash as received." }, { status: 403 });
  }
  const parsed = markReceivedSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });

  const result = await markCashReceiptsReceived({ ids: parsed.data.ids, note: parsed.data.note, actor: session.fullName, ip: clientIp(req) });
  return NextResponse.json({ ok: true, ...result });
}
