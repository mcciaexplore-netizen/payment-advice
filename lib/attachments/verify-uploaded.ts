import { get, head } from "@vercel/blob";
import { MAX_FILE_SIZE_BYTES } from "@/lib/validation/payment-advice";
import type { UploadedAttachment } from "@/lib/attachments/client-upload";

const PDF_MAGIC = "%PDF-";

export async function verifyUploadedAttachments(uploads: UploadedAttachment[]) {
  for (const upload of uploads) {
    let metadata;
    try {
      metadata = await head(upload.blobPathname);
    } catch {
      return `Could not verify the uploaded file "${upload.fileName}". Please attach it again.`;
    }
    if (
      metadata.pathname !== upload.blobPathname ||
      metadata.url !== upload.blobUrl ||
      metadata.size !== upload.sizeBytes
    ) {
      return `Uploaded file metadata for "${upload.fileName}" does not match Blob storage.`;
    }
    if (metadata.size > MAX_FILE_SIZE_BYTES || metadata.contentType !== "application/pdf") {
      return `"${upload.fileName}" must be a PDF no larger than 10 MB.`;
    }

    try {
      const blob = await get(upload.blobPathname, { access: "private", useCache: false });
      if (!blob || blob.statusCode !== 200 || !blob.stream) throw new Error("Blob unavailable");
      const reader = blob.stream.getReader();
      const signature: number[] = [];
      while (signature.length < 5) {
        const { value, done } = await reader.read();
        if (done) break;
        signature.push(...value.slice(0, 5 - signature.length));
      }
      await reader.cancel();
      const prefix = new TextDecoder().decode(new Uint8Array(signature));
      if (prefix !== PDF_MAGIC) return `"${upload.fileName}" is not a valid PDF file.`;
    } catch {
      return `Could not verify the uploaded file "${upload.fileName}". Please attach it again.`;
    }
  }
  return null;
}
