import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { recordNeftPayment } from "@/lib/advice/finance-stage-actions";

export const runtime = "nodejs";

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}



/**
 * "Record a Payment" — replaces the old single "Mark Payment Done" action
 * for NEFT only (see AGENT_HANDOFF.md). Cash Voucher's
 * POST .../payment-done route is completely untouched and still handles
 * Cash's one-shot terminal action exactly as before.
 *
 * Every entry is capped against `payable_amount` minus the sum of all
 * prior entries — never the raw Basic+GST Total. The cap check happens inside a
 * `SELECT ... FOR UPDATE`-locked transaction (same pattern lib/serial.ts
 * uses for gapless numbering) so two concurrent "Record a Payment" submits
 * against the same advice can never both pass a stale remaining-balance
 * check and together overpay it.
 *
 * `total_paid` is a cached running total (not a live SUM()), updated
 * atomically in the same transaction as the insert. The entry that brings
 * total_paid to payable_amount performs the same
 * status/approved_at/approved_by_name dual-write the old single Payment
 * Done action used to; partial entries never touch those fields. The logic
 * lives in lib/advice/finance-stage-actions.ts, shared with the bulk action.
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

  const body = await req.json().catch(() => null);
  const result = await recordNeftPayment(id, session.fullName, body, { ip: clientIp(req) });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({
    ok: true,
    totalPaid: result.data.totalPaid,
    remaining: result.data.remaining,
    isFinal: result.data.isFinal,
    paidAt: result.data.paidAt.toISOString(),
  });
}
