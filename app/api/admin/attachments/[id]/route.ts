import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { get } from "@vercel/blob";
import { db } from "@/lib/db";
import { attachments } from "@/lib/db/schema";

export const runtime = "nodejs";

// Admin never sees the raw Vercel Blob URL: this route fetches the blob
// server-side (via the SDK's authenticated `get`, since the store is
// private) and streams it through, so downloads always go through an
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
