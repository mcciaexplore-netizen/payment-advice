import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { get } from "@vercel/blob";
import { db } from "@/lib/db";
import { attachments, paymentAdvices } from "@/lib/db/schema";

export const runtime = "nodejs";

// Mirrors /api/admin/attachments/[id] (authenticated by admin cookie there)
// but authenticated by the authority_token instead, since the Recommending
// Authority never logs in. Deliberately restricted to the two doc types the
// approval page actually links to — Tax Invoice and Approval/Budget Letter
// — not every attachment on the advice.
const ALLOWED_DOC_TYPES = ["TAX_INVOICE", "APPROVAL_BUDGET"];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; attachmentId: string }> },
) {
  const { token, attachmentId } = await params;

  const [advice] = await db
    .select({ id: paymentAdvices.id })
    .from(paymentAdvices)
    .where(eq(paymentAdvices.authorityToken, token))
    .limit(1);
  if (!advice) {
    return NextResponse.json({ error: "This approval link is not valid." }, { status: 404 });
  }

  const [attachment] = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, attachmentId), eq(attachments.paymentAdviceId, advice.id)))
    .limit(1);
  if (!attachment || !ALLOWED_DOC_TYPES.includes(attachment.docType)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await get(attachment.blobPathname, { access: "private" });
  if (!result || result.statusCode !== 200) {
    return NextResponse.json({ error: "Could not fetch attachment" }, { status: 502 });
  }

  return new NextResponse(result.stream, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${attachment.fileName}"`,
    },
  });
}
