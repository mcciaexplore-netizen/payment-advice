import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { get } from "@vercel/blob";
import { db } from "@/lib/db";
import { attachments, paymentAdvices } from "@/lib/db/schema";
import { getAdminSession } from "@/lib/admin-session";
import { hasRole } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const session = await getAdminSession();
  if (!session || !hasRole(session, "AUTHORITY") || !session.recommendingAuthorityId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, attachmentId } = await params;
  const [advice] = await db.select({ id: paymentAdvices.id }).from(paymentAdvices).where(and(eq(paymentAdvices.id, id), eq(paymentAdvices.recommendingAuthorityId, session.recommendingAuthorityId))).limit(1);
  if (!advice) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [attachment] = await db.select().from(attachments).where(and(eq(attachments.id, attachmentId), eq(attachments.paymentAdviceId, advice.id))).limit(1);
  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const result = await get(attachment.blobPathname, { access: "private" });
  if (!result || result.statusCode !== 200) return NextResponse.json({ error: "Could not fetch attachment" }, { status: 502 });
  return new NextResponse(result.stream, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${attachment.fileName}"` } });
}
