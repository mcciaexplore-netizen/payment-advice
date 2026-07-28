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
      {help ? <p className="text-xs text-gray-500">{help}</p> : null}
      {children}
      {error ? (
        <p role="alert" className="text-sm font-medium text-[#b3261e]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
