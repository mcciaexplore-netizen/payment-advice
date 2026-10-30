import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { markCashPaymentDone } from "@/lib/advice/finance-stage-actions";

export const runtime = "nodejs";

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/**
 * Replaces the retired Sanction step as the terminal action (see
 * AGENT_HANDOFF.md — sanctioning now happens physically/offline, the app no
 * longer gates on it). Fires the moment Finance has actually paid, not a
 * moment earlier. `payment_done_by` is auto-attributed from the logged-in
 * Admin's session, same pattern as Verify — no picker.
 *
 * Role-gated since 2026-10-30 (owner decision, replacing the earlier
 * "default filter, not an authorization wall" rule): only CASH_VOUCHER or
 * ALL may mark a Cash submission Payment Done; anyone else gets 403. Same
 * rule the UI buttons and the bulk action use. Regular Cash Voucher retains its existing Bill Passed For
 * requirement unchanged. A Cash-routed Advance instead requires the new
 * persisted payable calculation; it never writes the retired field.
 *
 * Dual-writes the legacy `status`/`approved_at`/`approved_by_name` fields
 * exactly as Sanction used to (human-confirmed judgment call, see
 * AGENT_HANDOFF.md) so Excel export and the Payment Advice PDF's "Approved
 * on" line keep working unchanged, now reflecting Payment Done instead of
 * Sanction. The logic lives in lib/advice/finance-stage-actions.ts, shared
 * with the bulk action.
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
  const result = await markCashPaymentDone(id, session.fullName, session.roles, (body as { billPassedFor?: unknown } | null)?.billPassedFor, { ip: clientIp(req) });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, paymentDoneAt: result.data.paymentDoneAt.toISOString() });
}
