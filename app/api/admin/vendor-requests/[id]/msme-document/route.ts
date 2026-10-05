import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { get } from "@vercel/blob";
import { db } from "@/lib/db";
import { vendorRequests } from "@/lib/db/schema";
import { getAdminSession } from "@/lib/admin-session";
import { hasFinanceRole } from "@/lib/auth";

export const runtime = "nodejs";

function contentTypeFor(url: string) {
  if (/\.jpe?g($|\?)/i.test(url)) return "image/jpeg";
  if (/\.png($|\?)/i.test(url)) return "image/png";
  return "application/pdf";
}

// Same reasoning as /api/admin/attachments/[id]: the MSME document's blob is
// private, so Finance never sees the raw Vercel Blob URL - this route fetches
// it server-side and streams it through an authenticated request instead.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession();
  if (!session || !hasFinanceRole(session)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const { id } = await params;
  const [request] = await db
    .select({ msmeDocumentUrl: vendorRequests.msmeDocumentUrl })
    .from(vendorRequests)
    .where(eq(vendorRequests.id, id))
    .limit(1);
  if (!request?.msmeDocumentUrl) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await get(request.msmeDocumentUrl, { access: "private" });
  if (!result || result.statusCode !== 200) {
    return NextResponse.json({ error: "Could not fetch document" }, { status: 502 });
  }

  return new NextResponse(result.stream, {
    status: 200,
    headers: {
      "Content-Type": contentTypeFor(request.msmeDocumentUrl),
      "Content-Disposition": "inline; filename=\"msme-document\"",
    },
  });
}
