"use client";

import { useRef, useState } from "react";
import { MAX_FILE_SIZE_BYTES } from "@/lib/validation/payment-advice";

function isAllowedFile(file: File, allowImages: boolean) {
  const extension = file.name.toLowerCase().match(/\.(pdf|jpe?g|png)$/)?.[1];
  if (!extension) return false;
  if (extension === "pdf") return file.type === "application/pdf" || file.type === "";
  return allowImages && (file.type === "image/jpeg" || file.type === "image/png" || file.type === "");
}

export function FileUploadSlot({
  label,
  required,
  multiple,
  maxFiles = 1,
  files,
  onChange,
  externalError,
  existingFileNames,
  allowImages = false,
}: {
  label: string;
  required?: boolean;
  multiple?: boolean;
  maxFiles?: number;
  files: File[];
  onChange: (files: File[]) => void;
  externalError?: string;
  /** Attachments already on file from a previous submission (edit/resubmit
   * flow). Shown for reference; uploading a new file here replaces them. */
  existingFileNames?: string[];
  allowImages?: boolean;
}) {
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(selected: FileList | null) {
    if (!selected || selected.length === 0) return;
    setLocalError(null);

    const incoming = Array.from(selected);
    const next = [...files];

    for (const file of incoming) {
      if (next.length >= maxFiles) {
        setLocalError(
          maxFiles === 1
            ? `Only one file is allowed for ${label}.`
            : `Only up to ${maxFiles} files are allowed for ${label}.`,
        );
        break;
      }
      if (!isAllowedFile(file, allowImages)) {
        setLocalError(`"${file.name}" is not an accepted file. Use ${allowImages ? "PDF, JPEG, or PNG" : "PDF"}.`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setLocalError(`"${file.name}" is larger than 10 MB.`);
        continue;
      }
      next.push(file);
    }

    onChange(next);
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeFile(index: number) {
    setLocalError(null);
    onChange(files.filter((_, i) => i !== index));
  }

  const error = localError ?? externalError;

  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-baseline gap-2 text-sm font-medium text-[#0b1f3a]">
        <span>{label}</span>
        <span
          className={
            required
              ? "text-xs font-normal text-[#b3261e]"
              : "text-xs font-normal text-gray-400"
          }
        >
          {required ? "Required" : "Optional"}
        </span>
      </label>

      {existingFileNames && existingFileNames.length > 0 ? (
        <p className="text-xs text-gray-500">
          Currently attached: {existingFileNames.join(", ")}. Attach a new file above to replace it.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {files.map((file, i) => (
          <span
            key={`${file.name}-${i}`}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-sm"
          >
            <span className="max-w-[220px] truncate">{file.name}</span>
            <span className="text-xs text-gray-400">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </span>
            <button
              type="button"
              onClick={() => removeFile(i)}
              aria-label={`Remove ${file.name}`}
              className="text-gray-400 hover:text-[#b3261e]"
            >
              ×
            </button>
          </span>
        ))}

        {files.length < maxFiles && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-md border border-dashed border-gray-400 px-3 py-1.5 text-sm text-[#0b1f3a] hover:bg-[#0b1f3a]/5"
          >
            + Attach {allowImages ? "file" : "PDF"}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={allowImages ? "application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" : "application/pdf,.pdf"}
        multiple={multiple}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <p className="text-xs text-gray-500">{allowImages ? "PDF, JPEG, or PNG" : "PDF only"}, max 10 MB per file.</p>

      {error ? (
        <p role="alert" className="text-sm font-medium text-[#b3261e]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
