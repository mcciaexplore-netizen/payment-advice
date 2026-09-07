"use client";

import Image from "next/image";
import { useState } from "react";

type AttachmentPreviewProps = {
  fileName: string;
  href: string;
  children?: React.ReactNode;
  className?: string;
};

type InlineAttachmentPreviewProps = {
  fileName: string;
  href: string;
  label: string;
  meta?: string;
};

function isImage(fileName: string) {
  return /\.(jpe?g|png)$/i.test(fileName);
}

export function AttachmentPreview({ fileName, href, children = "Preview", className }: AttachmentPreviewProps) {
  const [open, setOpen] = useState(false);
  const image = isImage(fileName);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className ?? "font-medium text-[#0b1f3a] hover:underline"}
      >
        {children}
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Preview ${fileName}`}
          onClick={() => setOpen(false)}
        >
          <div
            className="flex h-[min(90vh,900px)] w-[min(96vw,1100px)] flex-col overflow-hidden rounded-md bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 border-b border-gray-200 px-4 py-3">
              <p className="truncate text-sm font-medium text-[#0b1f3a]">{fileName}</p>
              <div className="flex items-center gap-3">
                <a
                  href={href}
                  download={fileName}
                  className="text-sm font-medium text-[#0b1f3a] hover:underline"
                >
                  Download
                </a>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close preview"
                  className="rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 bg-gray-100 p-3">
              {image ? (
                <div className="relative h-full w-full">
                  <Image src={href} alt={fileName} fill unoptimized className="object-contain" />
                </div>
              ) : (
                <iframe title={`Preview of ${fileName}`} src={href} className="h-full w-full rounded border border-gray-200 bg-white" />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Shows the real document immediately in the detail page. The modal remains
 * available for a larger view, while Download preserves the original file. */
export function InlineAttachmentPreview({ fileName, href, label, meta }: InlineAttachmentPreviewProps) {
  const image = isImage(fileName);
  return (
    <article className="overflow-hidden rounded-md border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-4 py-3">
        <p className="text-sm font-medium text-[#0b1f3a]">{label}</p>
        <p className="mt-1 break-all text-xs text-gray-500">{fileName}{meta ? ` · ${meta}` : ""}</p>
      </div>
      <div className="h-72 bg-gray-100 p-2">
        {image ? (
          <div className="relative h-full w-full">
            <Image src={href} alt={fileName} fill unoptimized className="object-contain" />
          </div>
        ) : (
          <iframe title={`Inline preview of ${fileName}`} src={`${href}#view=FitH`} className="h-full w-full rounded border border-gray-200 bg-white" />
        )}
      </div>
      <div className="flex items-center justify-end gap-4 border-t border-gray-200 px-4 py-3 text-sm">
        <AttachmentPreview fileName={fileName} href={href}>Expand</AttachmentPreview>
        <a href={href} download={fileName} className="font-medium text-[#0b1f3a] hover:underline">Download</a>
      </div>
    </article>
  );
}
