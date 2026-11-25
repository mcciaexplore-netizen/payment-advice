import { NextRequest, NextResponse } from "next/server";
import { refundRecommendationEnabled } from "@/lib/refund-requests";
import { verifyUploadedAttachments } from "@/lib/attachments/verify-uploaded";
import { getSessionEmail, resubmitRefund } from "@/lib/advice/refund-resubmit";
import { clientIpFrom, createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 1024 * 1024;
const isRateLimited = createRateLimiter({ limit: 20, windowMs: 10 * 60 * 1000 });

const asString = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
};
const parseJson = (text: string, fallback: unknown) => {
  try {
    return JSON.parse(text || JSON.stringify(fallback));
  } catch {
    return undefined;
  }
};

/** The submitter resubmits a third party refund the authority sent back:
 * same refund, same reference number (see resubmitRefund). 404 while refund
 * recommendation is off, when nobody is signed in, and when the refund was
 * submitted by someone else; 409 when it is not waiting for corrections. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!refundRecommendationEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const accountEmail = await getSessionEmail();
  if (!accountEmail) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (isRateLimited(clientIpFrom(request.headers))) {
    return NextResponse.json({ error: "Too many requests from this connection. Please wait a few minutes and try again." }, { status: 429 });
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "The third party refund details are too large." }, { status: 413 });
  }
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid third party refund details." }, { status: 400 });

  const addedDocuments = parseJson(asString(form, "documents"), []);
  const keep = parseJson(asString(form, "keepDocuments"), []);
  if (addedDocuments === undefined || !Array.isArray(keep) || !keep.every((index) => Number.isInteger(index))) {
    return NextResponse.json({ error: "Document details are invalid." }, { status: 400 });
  }

  const result = await resubmitRefund({
    refundId: id,
    accountEmail,
    edits: {
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
    },
    keepIndexes: keep as number[],
    addedDocuments,
    verifyDocuments: (documents) => verifyUploadedAttachments(documents, true),
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    origin: new URL(request.url).origin,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, id, serialNo: result.serialNo });
}
