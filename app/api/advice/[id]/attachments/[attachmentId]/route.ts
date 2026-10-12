import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { get } from "@vercel/blob";
import { db } from "@/lib/db";
import { adminUserRoles, adminUsers, attachments, paymentAdvices } from "@/lib/db/schema";
import { getAdminSession } from "@/lib/admin-session";
import { attachmentContentType, canViewAdviceAttachments, contentDisposition } from "@/lib/advice/attachment-access";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

/** View (inline) or download (?download=1) one attachment from the
 * Authority / Team dashboards. Every request re-checks the session against
 * canViewAdviceAttachments; the raw Blob URL never reaches the browser,
 * the file is fetched server-side from the private store and streamed. The
 * attachment must belong to the submission in the path, so a guessed pair
 * of IDs cannot cross submissions. Not audited: the app logs PDF generation
 * but has no attachment-view event, and none is added here. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, attachmentId } = await params;
  if (!UUID.test(id) || !UUID.test(attachmentId)) return notFound();

  const [[advice], [account], roleRows] = await Promise.all([
    db.select({
      id: paymentAdvices.id,
      submittedByEmail: paymentAdvices.submittedByEmail,
      recommendingAuthorityId: paymentAdvices.recommendingAuthorityId,
      branch: paymentAdvices.branch,
      submittedByDepartment: paymentAdvices.submittedByDepartment,
    }).from(paymentAdvices).where(eq(paymentAdvices.id, id)).limit(1),
    db.select({ email: adminUsers.email }).from(adminUsers).where(eq(adminUsers.id, session.adminUserId)).limit(1),
    db.select({ role: adminUserRoles.role, recommendingAuthorityId: adminUserRoles.recommendingAuthorityId, scopeValue: adminUserRoles.scopeValue })
      .from(adminUserRoles).where(eq(adminUserRoles.adminUserId, session.adminUserId)),
  ]);
  if (!advice || !canViewAdviceAttachments(session, { email: account?.email ?? null, roleRows }, advice)) return notFound();

  const [attachment] = await db.select({ fileName: attachments.fileName, blobPathname: attachments.blobPathname })
    .from(attachments)
    .where(and(eq(attachments.id, attachmentId), eq(attachments.paymentAdviceId, advice.id)))
    .limit(1);
  if (!attachment) return notFound();

  const result = await get(attachment.blobPathname, { access: "private" });
  if (!result || result.statusCode !== 200) return NextResponse.json({ error: "Could not fetch attachment" }, { status: 502 });

  const download = req.nextUrl.searchParams.get("download") === "1";
  return new NextResponse(result.stream, {
    status: 200,
    headers: {
      "Content-Type": attachmentContentType(attachment.fileName),
      "Content-Disposition": contentDisposition(download ? "attachment" : "inline", attachment.fileName),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
