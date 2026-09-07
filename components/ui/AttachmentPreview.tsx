"use client";

import { useState } from "react";

type AttachmentPreviewProps = {
  fileName: string;
  href: string;
  children?: React.ReactNode;
};

function isImage(fileName: string) {
  return /\.(jpe?g|png)$/i.test(fileName);
}

export function AttachmentPreview({ fileName, href, children = "Preview" }: AttachmentPreviewProps) {
  const [open, setOpen] = useState(false);
  const image = isImage(fileName);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-medium text-[#0b1f3a] hover:underline"
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
                <img src={href} alt={fileName} className="h-full w-full object-contain" />
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