import { get, head } from "@vercel/blob";
import { MAX_FILE_SIZE_BYTES } from "@/lib/validation/payment-advice";
import type { UploadedAttachment } from "@/lib/attachments/client-upload";

const ALLOWED_CONTENT_TYPES = ["application/pdf", "image/jpeg", "image/png"];

export async function verifyUploadedAttachments(uploads: UploadedAttachment[], allowImages = false) {
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
    const allowedTypes = allowImages ? ALLOWED_CONTENT_TYPES : ["application/pdf"];
    if (metadata.size > MAX_FILE_SIZE_BYTES || !allowedTypes.includes(metadata.contentType)) {
      return `"${upload.fileName}" must be a ${allowImages ? "PDF, JPEG, or PNG" : "PDF"} no larger than 10 MB.`;
    }

    try {
      const blob = await get(upload.blobPathname, { access: "private", useCache: false });
      if (!blob || blob.statusCode !== 200 || !blob.stream) throw new Error("Blob unavailable");
      const reader = blob.stream.getReader();
      const signature: number[] = [];
      while (signature.length < 8) {
        const { value, done } = await reader.read();
        if (done) break;
        signature.push(...value.slice(0, 8 - signature.length));
      }
      await reader.cancel();
      const bytes = new Uint8Array(signature);
      const valid = metadata.contentType === "application/pdf"
        ? new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-"
        : metadata.contentType === "image/jpeg"
          ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
          : bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
      if (!valid) return `"${upload.fileName}" is not a valid ${metadata.contentType === "application/pdf" ? "PDF" : "image"} file.`;
    } catch {
      return `Could not verify the uploaded file "${upload.fileName}". Please attach it again.`;
    }
  }
  return null;
}
