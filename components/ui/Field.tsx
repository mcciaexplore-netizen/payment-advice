import { ReactNode } from "react";

export function Field({
  label,
  htmlFor,
  required,
  error,
  help,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="flex items-baseline gap-2 text-sm font-medium text-[#0b1f3a]"
      >
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
      {/* Always rendered, whether or not `help` is set — this reserves the
          same fixed-height slot for every field, so two fields sitting
          side-by-side in a grid (one with helper text, one without) still
          start their inputs at the same vertical position. `invisible`
          (not a display:none/conditional render) keeps a real line box in
          the layout without a one-off margin hack that could drift again
          if the copy changes. */}
      <p className={`text-xs text-gray-500 ${help ? "" : "invisible"}`}>{help || " "}</p>
      {children}
      {error ? (
        <p role="alert" className="text-sm font-medium text-[#b3261e]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
