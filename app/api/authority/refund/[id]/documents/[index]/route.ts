import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { get } from "@vercel/blob";
import { db } from "@/lib/db";
import { refundRequests } from "@/lib/db/schema";
import { refundRecommendationEnabled } from "@/lib/refund-requests";
import { getRefundAuthority } from "@/lib/advice/refund-authority-session";
import { refundsForAuthorityWhere } from "@/lib/advice/refund-authority";
import { attachmentContentType, contentDisposition } from "@/lib/advice/attachment-access";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

/** One supporting document of a refund that names the signed-in authority, so
 * they can review it before recommending. Same as the Finance route, but
 * scoped to the authority's own refunds; the file is streamed from the
 * private Blob store, so no Blob URL reaches the browser. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; index: string }> }) {
  if (!refundRecommendationEnabled()) return notFound();
  const authority = await getRefundAuthority();
  if (!authority) return notFound();
  const { id, index } = await params;
  const position = Number(index);
  if (!UUID.test(id) || !Number.isInteger(position) || position < 0) return notFound();

  const [refund] = await db.select({ documents: refundRequests.documents }).from(refundRequests)
    .where(and(eq(refundRequests.id, id), refundsForAuthorityWhere(authority.name))).limit(1);
  const document = refund?.documents[position];
  if (!document) return notFound();

  const result = await get(document.blobPathname, { access: "private" });
  if (!result || result.statusCode !== 200) return NextResponse.json({ error: "Could not fetch document" }, { status: 502 });

  const download = req.nextUrl.searchParams.get("download") === "1";
  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": attachmentContentType(document.fileName),
      "Content-Disposition": contentDisposition(download ? "attachment" : "inline", document.fileName),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
