import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { get } from "@vercel/blob";
import { db } from "@/lib/db";
import { refundRequests } from "@/lib/db/schema";
import { getAdminSession } from "@/lib/admin-session";
import { hasFinanceRole } from "@/lib/auth";
import { attachmentContentType, contentDisposition } from "@/lib/advice/attachment-access";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

/** One document of a Refund request, for Finance only. proxy.ts already
 * limits /api/admin/* to Finance sessions; this re-checks so the rule holds
 * even if the route is ever moved. The file is streamed from the private
 * Blob store, so no Blob URL reaches the browser. ?download=1 saves it,
 * otherwise it opens inline. Not audited, same as advice attachments. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; index: string }> }) {
  const session = await getAdminSession();
  if (!hasFinanceRole(session)) return notFound();
  const { id, index } = await params;
  const position = Number(index);
  if (!UUID.test(id) || !Number.isInteger(position) || position < 0) return notFound();

  const [refund] = await db.select({ documents: refundRequests.documents }).from(refundRequests).where(eq(refundRequests.id, id)).limit(1);
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
