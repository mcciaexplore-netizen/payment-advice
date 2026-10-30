import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin-session";
import { canMarkCashReceiptReceived, resendCashReceiptReceivedEmail } from "@/lib/cash-receipts/received";

export const runtime = "nodejs";

/** Resends the "Cash received" email when the first one did not go out. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canMarkCashReceiptReceived(session)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const result = await resendCashReceiptReceivedEmail(id);
  if (result.status === "not-eligible") return NextResponse.json({ error: "This receipt is not marked received, or its email was already sent." }, { status: 409 });
  if (result.status === "sent") return NextResponse.json({ ok: true, status: "sent" });
  const error = result.status === "no-address" ? "The issuer has no email address on file."
    : result.status === "preview" ? "Email is in preview mode on this server, so nothing was sent."
    : "The email could not be sent. Try again later.";
  return NextResponse.json({ ok: false, status: result.status, error }, { status: 502 });
}
