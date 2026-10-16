import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SubmissionDownloadButtons } from "@/components/admin/SubmissionDownloadButtons";
import { submissionPdfLabel } from "@/lib/advice/submission-pdf";

const ADVICE_ID = "11111111-1111-4111-8111-111111111111";
const render = (attachments: Array<{ id: string; fileName: string }>) => renderToStaticMarkup(createElement(SubmissionDownloadButtons, {
  adviceId: ADVICE_ID, attachments, pdfHref: `/api/advice/${ADVICE_ID}/pdf`, pdfLabel: "Download Payment Advice",
}));
/** Visible text of each button/link (icons and screen-reader-only text dropped). */
const labels = (html: string) => [...html.matchAll(/<(?:a|button)\b[^>]*>(.*?)<\/(?:a|button)>/g)]
  .map((match) => match[1].replace(/<span class="sr-only">.*?<\/span>/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());

describe("SubmissionDownloadButtons", () => {
  it("orders the buttons [View] [Download] | [Download {document}], full names as tooltip and accessible name", () => {
    const html = render([{ id: "a1", fileName: "invoice.pdf" }]);
    expect(labels(html)).toEqual(["View", "Download", "Download Payment Advice"]);
    expect(html).toContain('<span title="View Attachment"');
    expect(html).toContain('<span class="sr-only">View Attachment</span>');
    expect(html).toContain('title="Download Attachment" aria-label="Download Attachment"');
    expect(html).toContain('role="group" aria-label="Attachment"');
    expect(html).toContain("md:flex-nowrap");
  });

  it("one attachment: direct actions through the authenticated route, original filename, no Blob URL", () => {
    const html = render([{ id: "a1", fileName: "invoice.pdf" }]);
    expect(html).toContain(`href="/api/advice/${ADVICE_ID}/attachments/a1?download=1"`);
    expect(html).toContain('download="invoice.pdf"');
    expect(html).not.toMatch(/blob\.vercel-storage\.com/);
    expect(html).not.toContain("aria-haspopup");
  });

  it("several attachments: both buttons open a file list (and show the count)", () => {
    const html = render([{ id: "a1", fileName: "invoice.pdf" }, { id: "a2", fileName: "po.png" }]);
    expect(labels(html)).toEqual(["View (2) ▾", "Download (2) ▾", "Download Payment Advice"]);
    expect(html).toContain('aria-label="View Attachment (2)"');
    expect(html).toContain('title="Download Attachment (2)"');
    expect(html.match(/aria-haspopup="true"/g)).toHaveLength(2);
  });

  it("no attachment: both buttons stay in place, disabled, with a No attachment tooltip", () => {
    const html = render([]);
    expect(labels(html)).toEqual(["View", "Download", "Download Payment Advice"]);
    expect(html.match(/title="No attachment"/g)).toHaveLength(2);
    expect(html.match(/<button[^>]*disabled=""/g)).toHaveLength(2);
  });

  it("labels the PDF button by document type", () => {
    expect(submissionPdfLabel({ paymentMode: "NEFT", isAdvance: false })).toBe("Download Payment Advice");
    expect(submissionPdfLabel({ paymentMode: "CASH", isAdvance: false })).toBe("Download Cash Voucher");
    expect(submissionPdfLabel({ paymentMode: "NEFT", isAdvance: true })).toBe("Download Advance");
    expect(submissionPdfLabel({ paymentMode: "CASH", isAdvance: true })).toBe("Download Advance");
  });

  it("the dashboard uses the shared group on My Submissions and Team Submissions, and no longer says Download PDF", () => {
    const page = fs.readFileSync(path.join(process.cwd(), "app/authority/page.tsx"), "utf8");
    expect(page).toContain('const showDownloads = view === "my-submissions" || view === "team-submissions"');
    expect(page).toContain("<SubmissionDownloadButtons adviceId={row.id}");
    expect(page).not.toContain("Download PDF");
    expect(page).not.toContain("blobUrl");
  });
});
