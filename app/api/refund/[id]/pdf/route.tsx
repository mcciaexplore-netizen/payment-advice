import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog, refundRequests } from "@/lib/db/schema";
import { refundRequestsEnabled } from "@/lib/refund-requests";
import { renderRefundRequestPdf } from "@/lib/pdf/render-refund-request";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

/** Printable copy of a saved Refund request, read from the DB. Same access
 * model as the Forwarding Memo and Payment Advice PDFs: unauthenticated but
 * keyed by the row's random UUID, which only the submitter gets (on their
 * confirmation page). 404 while the feature flag is off, so nothing queries
 * a table that may not exist yet. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!refundRequestsEnabled()) return notFound();
  const { id } = await params;
  if (!UUID.test(id)) return notFound();

  const [row] = await db.select().from(refundRequests).where(eq(refundRequests.id, id)).limit(1);
  if (!row) return notFound();

  const buffer = await renderRefundRequestPdf({ ...row, documents: row.documents.map(({ type, fileName }) => ({ type, fileName })) });

  await db.insert(auditLog).values({
    refundRequestId: row.id,
    action: "REFUND_REQUEST_PDF_GENERATED",
    actor: row.submittedByName,
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    details: { serialNo: row.serialNo, source: "public" },
  });

  const download = req.nextUrl.searchParams.get("download") === "1";
  const filename = `${row.serialNo.replace(/\//g, "-")}.pdf`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
