import { get, head } from "@vercel/blob";
import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { vendors } from "@/lib/db/schema";
import {
  findConfidentInvoiceVendor,
  invoiceExtractionSchema,
  type InvoiceVendorCandidate,
} from "@/lib/invoice-autofill";
import { MAX_FILE_SIZE_BYTES } from "@/lib/validation/payment-advice";
import { PENDING_UPLOAD_PREFIX } from "@/lib/attachments/client-upload";
import { clientIpFrom, createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Each call sends a file to Gemini (cost), so it is throttled per IP per
 * warm instance. Best effort, same limiter as the refund and upload routes. */
const isRateLimited = createRateLimiter({ limit: 20, windowMs: 10 * 60 * 1000 });

const requestSchema = z.object({
  pathname: z
    .string()
    .startsWith(`${PENDING_UPLOAD_PREFIX}`)
    .regex(/\/TAX_INVOICE-[^/]+\.(pdf|jpe?g|png)$/i)
    .max(1024),
});

const responseJsonSchema = {
  type: "object",
  properties: {
    billNo: { type: ["string", "null"] },
    billDate: { type: ["string", "null"], description: "ISO date YYYY-MM-DD, or null." },
    basicAmount: { type: ["number", "null"] },
    gstAmount: { type: ["number", "null"] },
    payeeName: { type: ["string", "null"] },
    bankAccountNo: { type: ["string", "null"] },
    bankIfsc: { type: ["string", "null"] },
    bankName: { type: ["string", "null"] },
  },
  required: [
    "billNo",
    "billDate",
    "basicAmount",
    "gstAmount",
    "payeeName",
    "bankAccountNo",
    "bankIfsc",
    "bankName",
  ],
  additionalProperties: false,
};

const extractionPrompt = `Read this Indian tax invoice. Return JSON only.
Extract a field only when it is plainly legible and unambiguous; otherwise use null.
- billNo: invoice/bill number, not PO or delivery challan number.
- billDate: invoice date in YYYY-MM-DD.
- basicAmount: taxable/basic subtotal excluding GST, as a number with no currency symbols.
- gstAmount: total GST (CGST + SGST + IGST) as a number; use 0 only when the invoice clearly shows no GST.
- payeeName: the supplier/vendor/company issuing the invoice, not the buyer.
- bankAccountNo: the invoice issuer's own bank account number, only if a "Bank Details" section is printed on the invoice itself - never the buyer's account, never a routing/branch code.
- bankIfsc: the invoice issuer's own IFSC code from that same bank details section, if present.
- bankName: the name of the bank itself (e.g. "Kotak Mahindra Bank", "HDFC Bank") from that same section, if present - not the branch name.
Never estimate or infer missing values.`;

async function readBlobAsBase64(pathname: string) {
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) throw new Error("Blob unavailable");
  const reader = result.stream.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      // Belt and braces next to the metadata size check: never buffer more
      // than the 10 MB limit, whatever the stored metadata claims.
      if (total > MAX_FILE_SIZE_BYTES) throw new Error("Invoice file too large");
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("base64");
}

/**
 * A deliberately silent best-effort helper. It is not an authoritative
 * extraction service: failed/unreadable documents simply produce no fields
 * and leave the established manual form flow untouched.
 */
export async function POST(request: Request) {
  if (isRateLimited(clientIpFrom(request.headers))) {
    return NextResponse.json({ autoFill: null, error: "Too many invoice reads from this connection. Please wait a few minutes, or fill the form manually." }, { status: 429 });
  }
  // Only a Tax Invoice already uploaded to the private Blob store (by the
  // form, under pending-uploads/) is accepted. There is no direct file
  // upload path, so this public route cannot be used to push arbitrary
  // files to Gemini.
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ autoFill: null, error: "The uploaded invoice reference is invalid. Attach the file again." }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("Gemini invoice auto-fill requested without GEMINI_API_KEY configured");
    return NextResponse.json({ autoFill: null, error: "Invoice auto-fill is not available right now. Please fill the form manually." }, { status: 503 });
  }

  try {
    const metadata = await head(parsed.data.pathname);
    if (
      metadata.size > MAX_FILE_SIZE_BYTES ||
      !["application/pdf", "image/jpeg", "image/png"].includes(metadata.contentType)
    ) {
      return NextResponse.json({ autoFill: null, error: "Use a PDF, JPEG, or PNG file no larger than 10 MB." }, { status: 400 });
    }
    const mimeType = metadata.contentType;
    const base64 = await readBlobAsBase64(parsed.data.pathname);

    let vendorRows: InvoiceVendorCandidate[];
    try {
      vendorRows = await db
        .select({
          id: vendors.id,
          companyName: vendors.companyName,
          contactPerson: vendors.contactPerson,
          contactPhone: vendors.contactPhone,
          address: vendors.address,
          email: vendors.email,
          gstin: vendors.gstin,
          udyamNumber: vendors.udyamNumber,
        })
        .from(vendors)
        .where(and(eq(vendors.isActive, true)));
    } catch (error) {
      // Invoice fields remain useful during local development even when the
      // optional vendor database is not configured; in that case we simply
      // skip matching the extracted payee to a canonical vendor record.
      console.warn("Invoice auto-fill vendor lookup unavailable", error instanceof Error ? error.message : error);
      vendorRows = [];
    }

    const ai = new GoogleGenAI({ apiKey });
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        { text: extractionPrompt },
        { inlineData: { mimeType, data: base64 } },
      ],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema,
        temperature: 0,
      },
    });
    const extracted = invoiceExtractionSchema.safeParse(JSON.parse(result.text || "null"));
    if (!extracted.success || !Object.values(extracted.data).some((value) => value !== null)) {
      return NextResponse.json({ autoFill: null, error: "We couldn't identify invoice details in this file. Try a clearer scan, or fill the form manually." }, { status: 422 });
    }

    const matchedVendor = findConfidentInvoiceVendor(extracted.data.payeeName, vendorRows);
    // Only a real, active vendor selected above is returned as `vendor` —
    // the client has no path to turn an unmatched extracted name into a
    // vendorId. `payeeName` is also returned as plain free text alongside
    // it (same as billNo/amounts) so the client can use it as a Beneficiary
    // Name fallback when no known bank account exists for the matched
    // vendor, or no vendor was confidently matched at all — this is never
    // used to select or create a vendor, only to pre-fill an editable text
    // field, so it carries none of the vendor-selection risk that gate
    // exists for.
    return NextResponse.json({
      autoFill: {
        billNo: extracted.data.billNo,
        billDate: extracted.data.billDate,
        basicAmount: extracted.data.basicAmount,
        gstAmount: extracted.data.gstAmount,
        payeeName: extracted.data.payeeName,
        bankAccountNo: extracted.data.bankAccountNo,
        bankIfsc: extracted.data.bankIfsc,
        bankName: extracted.data.bankName,
        vendor: matchedVendor,
      },
    });
  } catch (error) {
    // Invoice quality, model response and provider failures are intentionally
    // non-blocking. Keep minimal server observability without exposing an
    // extraction/provider error to a public submitter.
    console.warn("Gemini invoice auto-fill unavailable", error instanceof Error ? error.message : error);
    return NextResponse.json({ autoFill: null, error: "Invoice reading failed. Try again with a clearer PDF or image, or fill the form manually." }, { status: 502 });
  }
}
