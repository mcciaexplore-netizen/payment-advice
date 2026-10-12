"use client";

import { useEffect, useRef, useState } from "react";
import { AttachmentPreview } from "@/components/ui/AttachmentPreview";

export type SubmissionAttachment = { id: string; fileName: string };

const buttonClass = "inline-flex items-center text-left xl:whitespace-nowrap rounded-md border border-[#0b1f3a] px-3 py-2 text-xs font-medium text-[#0b1f3a] hover:bg-[#0b1f3a]/5";
const disabledClass = "inline-flex cursor-not-allowed items-center text-left xl:whitespace-nowrap rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-400";
const menuItemClass = "block w-full truncate px-3 py-2 text-left text-xs text-[#0b1f3a] hover:bg-[#0b1f3a]/5";

/** The Download column on the Authority and Team dashboards:
 * View Attachment | Download Attachment | Download {document}.
 *
 * Files are served by /api/advice/[id]/attachments/[attachmentId], which
 * checks the session on every request; no Blob URL is ever put in the
 * page. One attachment: direct action. Several: each button opens a small
 * list of file names, shown inside the cell (not a floating popover) so the
 * table's overflow container can never clip it. None: both attachment
 * buttons stay in place, disabled, with a "No attachment" tooltip. */
export function SubmissionDownloadButtons({
  adviceId,
  attachments,
  pdfHref,
  pdfLabel,
}: {
  adviceId: string;
  attachments: SubmissionAttachment[];
  pdfHref: string;
  pdfLabel: string;
}) {
  const [menu, setMenu] = useState<"view" | "download" | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setMenu(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menu]);

  const fileHref = (attachment: SubmissionAttachment) => `/api/advice/${adviceId}/attachments/${attachment.id}`;
  const downloadHref = (attachment: SubmissionAttachment) => `${fileHref(attachment)}?download=1`;
  const toggle = (next: "view" | "download") => setMenu((current) => current === next ? null : next);

  return (
    <div ref={rootRef} className="flex flex-col gap-2">
      {/* Attachment pair on one line, the PDF button under it: all three on
          one line would need ~527px, more than this column gets inside the
          max-w-6xl dashboard without the table scrolling sideways. */}
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex flex-wrap gap-2">
          {attachments.length === 0 ? (
            <>
              <span title="No attachment"><button type="button" disabled aria-label="View Attachment (no attachment)" className={disabledClass}>View Attachment</button></span>
              <span title="No attachment"><button type="button" disabled aria-label="Download Attachment (no attachment)" className={disabledClass}>Download Attachment</button></span>
            </>
          ) : attachments.length === 1 ? (
            <>
              <AttachmentPreview fileName={attachments[0].fileName} href={fileHref(attachments[0])} className={buttonClass}>View Attachment</AttachmentPreview>
              <a href={downloadHref(attachments[0])} download={attachments[0].fileName} className={buttonClass}>Download Attachment</a>
            </>
          ) : (
            <>
              <button type="button" aria-expanded={menu === "view"} aria-haspopup="true" onClick={() => toggle("view")} className={buttonClass}>View Attachment ({attachments.length}) ▾</button>
              <button type="button" aria-expanded={menu === "download"} aria-haspopup="true" onClick={() => toggle("download")} className={buttonClass}>Download Attachment ({attachments.length}) ▾</button>
            </>
          )}
        </div>
        <a href={pdfHref} download className={buttonClass}>{pdfLabel}</a>
      </div>
      {menu && attachments.length > 1 ? (
        <div
          role="menu"
          aria-label={menu === "view" ? "View an attachment" : "Download an attachment"}
          onKeyDown={(event) => { if (event.key === "Escape") setMenu(null); }}
          className="max-w-xs overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm"
        >
          {attachments.map((attachment) => menu === "view" ? (
            <AttachmentPreview key={attachment.id} fileName={attachment.fileName} href={fileHref(attachment)} className={menuItemClass}>{attachment.fileName}</AttachmentPreview>
          ) : (
            <a key={attachment.id} role="menuitem" href={downloadHref(attachment)} download={attachment.fileName} className={menuItemClass}>{attachment.fileName}</a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
