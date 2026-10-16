import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { MAX_FILE_SIZE_BYTES } from "@/lib/validation/payment-advice";
import { PENDING_UPLOAD_PREFIX } from "@/lib/attachments/client-upload";
import { clientIpFrom, createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** Upload-token requests per IP per warm instance, shared by every form
 * (Payment Advice, Cash Voucher, Advance, Vendor requests, Refund). Set high
 * because one submission can carry several files and staff share office
 * IPs; it only stops sustained bursts. Blob's completion callback (no
 * x-forwarded-for of a real browser) is not counted. */
const isRateLimited = createRateLimiter({ limit: 120, windowMs: 10 * 60 * 1000 });

export async function POST(request: Request) {
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  }

  if (body?.type === "blob.generate-client-token" && isRateLimited(clientIpFrom(request.headers))) {
    return NextResponse.json({ error: "Too many uploads from this connection. Please wait a few minutes and try again." }, { status: 429 });
  }

  try {
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(PENDING_UPLOAD_PREFIX) || !/\.(pdf|jpe?g|png)$/i.test(pathname)) {
          throw new Error("Only PDF, JPEG, and PNG attachments are allowed.");
        }
        return {
          allowedContentTypes: ["application/pdf", "image/jpeg", "image/png"],
          maximumSizeInBytes: MAX_FILE_SIZE_BYTES,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {
        // The final /api/submit or /api/edit request verifies the returned
        // Blob metadata before linking it to an advice. No DB write belongs
        // in this callback because the advice does not exist yet.
      },
    });
    return NextResponse.json(response);
  } catch (error) {
    console.error("Client attachment upload failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not authorize attachment upload." },
      { status: 400 },
    );
  }
}
