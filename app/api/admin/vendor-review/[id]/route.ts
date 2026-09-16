import { NextRequest, NextResponse } from "next/server";
import { performVendorReviewAction } from "@/lib/advice/vendor-review";
import { getAdminSession } from "@/lib/admin-session";
import { hasFinanceRole } from "@/lib/auth";
import { vendorReviewActionSchema } from "@/lib/validation/vendor-review";

export const runtime = "nodejs";

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!hasFinanceRole(session)) {
    return NextResponse.json(
      { error: "Your account cannot review vendor matches." },
      { status: 403 },
    );
  }

  const parsed = vendorReviewActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid vendor review action." },
      { status: 400 },
    );
  }

  const result = await performVendorReviewAction({
    adviceId: id,
    action: parsed.data,
    actor: session.fullName,
    ipAddress: clientIp(req),
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
