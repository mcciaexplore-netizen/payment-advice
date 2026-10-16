import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auditLog, refundRequests } from "@/lib/db/schema";
import { allocateRefundNumber, financialYearFor } from "@/lib/serial";
import { todayInIst } from "@/lib/date-time";
import { verifyUploadedAttachments } from "@/lib/attachments/verify-uploaded";
import { refundEntryVisible, refundRequestsEnabled } from "@/lib/refund-requests";
import { refundAmounts, refundRequestSchema } from "@/lib/validation/refund-request";

export const runtime = "nodejs";

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

const asString = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
};

/** Submits a Refund request.
 * - Flag off in production: 404, the feature does not exist yet.
 * - Flag off outside production: validates and answers previewOnly, with no
 *   database access at all (dev and prod share one database).
 * - Flag on: allocates REF/MCCIA/<FY>/NNNN, inserts the row and writes the
 *   REFUND_REQUEST_SUBMITTED audit entry in one transaction, so a failed
 *   insert never consumes a number. request_date is the server's IST date. */
export async function POST(request: NextRequest) {
  if (!refundEntryVisible()) {
    return NextResponse.json({ error: "Refund requests are not enabled yet." }, { status: 404 });
  }
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid refund details." }, { status: 400 });

  let documents: unknown;
  try {
    documents = JSON.parse(asString(form, "documents") || "[]");
  } catch {
    return NextResponse.json({ error: "Document details are invalid." }, { status: 400 });
  }

  const now = new Date();
  const requestDate = todayInIst(now);
  const parsed = refundRequestSchema(requestDate).safeParse({
    submittedByName: asString(form, "submittedByName"),
    submittedByEmail: asString(form, "submittedByEmail"),
    submittedByDepartment: asString(form, "submittedByDepartment"),
    branch: asString(form, "branch"),
    recommendingAuthority: asString(form, "recommendingAuthority"),
    payeeName: asString(form, "payeeName"),
    payeeAddress: asString(form, "payeeAddress"),
    payeeContactPerson: asString(form, "payeeContactPerson"),
    payeeContactPhone: asString(form, "payeeContactPhone"),
    payeeEmail: asString(form, "payeeEmail"),
    payeeGstin: asString(form, "payeeGstin"),
    payeeUdyamNumber: asString(form, "payeeUdyamNumber"),
    basicAmount: Number(asString(form, "basicAmount") || 0),
    gstAmount: Number(asString(form, "gstAmount") || 0),
    natureOfExpenditure: asString(form, "natureOfExpenditure"),
    fromDate: asString(form, "fromDate"),
    bankName: asString(form, "bankName"),
    beneficiaryName: asString(form, "beneficiaryName"),
    bankAccountNo: asString(form, "bankAccountNo"),
    bankIfsc: asString(form, "bankIfsc"),
    enclosures: asString(form, "enclosures"),
    specialRemarks: asString(form, "specialRemarks"),
    documents,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid refund details." }, { status: 400 });
  }

  if (!refundRequestsEnabled()) {
    return NextResponse.json({ previewOnly: true, serialNo: "LOCAL PREVIEW ONLY" });
  }

  const values = parsed.data;
  const documentError = await verifyUploadedAttachments(values.documents, true);
  if (documentError) return NextResponse.json({ error: documentError }, { status: 400 });

  try {
    const created = await db.transaction(async (tx) => {
      const financialYear = financialYearFor(now);
      const serialNo = await allocateRefundNumber(tx, financialYear);
      const [row] = await tx.insert(refundRequests).values({
        serialNo,
        financialYear,
        requestDate,
        submittedByName: values.submittedByName,
        submittedByEmail: values.submittedByEmail,
        submittedByDepartment: values.submittedByDepartment,
        branch: values.branch,
        recommendingAuthority: values.recommendingAuthority,
        payeeName: values.payeeName,
        payeeAddress: values.payeeAddress || null,
        payeeContactPerson: values.payeeContactPerson || null,
        payeeContactPhone: values.payeeContactPhone || null,
        payeeEmail: values.payeeEmail || null,
        payeeGstin: values.payeeGstin || null,
        payeeUdyamNumber: values.payeeUdyamNumber || null,
        ...refundAmounts(values),
        natureOfExpenditure: values.natureOfExpenditure,
        fromDate: values.fromDate,
        bankName: values.bankName || null,
        beneficiaryName: values.beneficiaryName || null,
        bankAccountNo: values.bankAccountNo || null,
        bankIfsc: values.bankIfsc || null,
        enclosures: values.enclosures || null,
        specialRemarks: values.specialRemarks || null,
        documents: values.documents,
      }).returning({ id: refundRequests.id, serialNo: refundRequests.serialNo });

      await tx.insert(auditLog).values({
        refundRequestId: row.id,
        action: "REFUND_REQUEST_SUBMITTED",
        actor: values.submittedByName,
        ipAddress: clientIp(request),
        details: { serialNo: row.serialNo, total: refundAmounts(values).totalAmount, documents: values.documents.length },
      });
      return row;
    });
    return NextResponse.json({ previewOnly: false, id: created.id, serialNo: created.serialNo });
  } catch (error) {
    console.error("[Refund] database submission failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Something went wrong while submitting. Please try again." }, { status: 503 });
  }
}
