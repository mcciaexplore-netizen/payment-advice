import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { hasFinanceRole } from "@/lib/auth";
import { bulkRequestSchema, runBulkFinanceAction } from "@/lib/advice/bulk-finance-actions";

export const runtime = "nodejs";
// Each request carries a small chunk (the browser sends 5 at a time); the
// loop also stops itself before this limit.
export const maxDuration = 60;

const clientIp = (req: NextRequest) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

/** Bulk Received / Verified / Payment for Finance. proxy.ts already limits
 * /api/admin/* to Finance; this re-checks. Body: { action, items, batchId,
 * dryRun? }. With dryRun the request only checks stage, role and payment
 * rows and changes nothing. */
export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!hasFinanceRole(session)) return NextResponse.json({ error: "Finance access is required." }, { status: 403 });

  const parsed = bulkRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });

  const response = await runBulkFinanceAction(session, parsed.data, clientIp(req), { deadlineMs: Date.now() + 45_000 });
  if (response.kind === "invalid") {
    return NextResponse.json({ error: "Some rows need fixing. Nothing was changed.", errors: response.errors }, { status: 400 });
  }
  return NextResponse.json({ ok: true, ...response });
}
