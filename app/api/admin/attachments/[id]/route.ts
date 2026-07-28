import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { attachments } from "@/lib/db/schema";

export const runtime = "nodejs";

// Admin never sees the raw Vercel Blob URL: this route fetches the blob
// server-side and streams it through, so downloads always go through an
// authenticated request (this route lives under /api/admin, already
// protected by proxy.ts).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [attachment] = await db
    .select()
    .from(attachments)
    .where(eq(attachments.id, id))
    .limit(1);
  if (!attachment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const blobRes = await fetch(attachment.blobUrl);
  if (!blobRes.ok || !blobRes.body) {
    return NextResponse.json({ error: "Could not fetch attachment" }, { status: 502 });
  }

  return new NextResponse(blobRes.body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${attachment.fileName}"`,
    },
  });
}
