import { InputHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { hasError?: boolean }
>(function Input({ className, hasError, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={clsx(
        "w-full rounded-md border px-3 py-2 text-base text-[#171717] shadow-sm outline-none transition",
        "focus:border-[#0b1f3a] focus:ring-2 focus:ring-[#0b1f3a]/20",
        hasError ? "border-[#b3261e]" : "border-gray-300",
        className,
      )}
      {...props}
    />
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { hasError?: boolean }
>(function Textarea({ className, hasError, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={clsx(
        "w-full rounded-md border px-3 py-2 text-base text-[#171717] shadow-sm outline-none transition",
        "focus:border-[#0b1f3a] focus:ring-2 focus:ring-[#0b1f3a]/20",
        hasError ? "border-[#b3261e]" : "border-gray-300",
        className,
      )}
      {...props}
    />
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { hasError?: boolean }
>(function Select({ className, hasError, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={clsx(
        "w-full rounded-md border bg-white px-3 py-2 text-base text-[#171717] shadow-sm outline-none transition",
        "focus:border-[#0b1f3a] focus:ring-2 focus:ring-[#0b1f3a]/20",
        hasError ? "border-[#b3261e]" : "border-gray-300",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});
