import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { MAX_FILE_SIZE_BYTES } from "@/lib/validation/payment-advice";
import { PENDING_UPLOAD_PREFIX } from "@/lib/attachments/client-upload";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  }

  try {
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(PENDING_UPLOAD_PREFIX) || !pathname.toLowerCase().endsWith(".pdf")) {
          throw new Error("Only PDF attachments are allowed.");
        }
        return {
          allowedContentTypes: ["application/pdf"],
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
