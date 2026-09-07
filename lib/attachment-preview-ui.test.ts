import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("authenticated attachment previews", () => {
  it("uses the shared in-page preview for Finance attachments and per-row bills", () => {
    const page = source("app/admin/advice/[id]/page.tsx");
    expect(page).toContain("<InlineAttachmentPreview");
    expect(page).toContain("<AttachmentPreview");
    expect(page).toContain("/api/admin/attachments/${bill.id}");
    expect(page).toContain("/api/admin/attachments/${a.id}");
  });

  it("uses the same preview for Authority attachments and per-row bills", () => {
    const page = source("app/authority/advice/[id]/page.tsx");
    expect(page).toContain("<InlineAttachmentPreview");
    expect(page).toContain("<AttachmentPreview");
    expect(page).not.toContain('target="_blank"');
  });

  it("embeds the real PDF or image before any preview click", () => {
    const component = source("components/ui/AttachmentPreview.tsx");
    expect(component).toContain("export function InlineAttachmentPreview");
    expect(component).toContain('src={`${href}#view=FitH`}');
    expect(component).toContain("<Image src={href}");
  });

  it("streams PDF, JPEG, and PNG files inline for Authority previews", () => {
    const route = source("app/api/authority/advice/[id]/attachments/[attachmentId]/route.ts");
    expect(route).toContain('return "image/jpeg"');
    expect(route).toContain('return "image/png"');
    expect(route).toContain('return "application/pdf"');
    expect(route).toContain('"Content-Disposition": `inline;');
  });
});
