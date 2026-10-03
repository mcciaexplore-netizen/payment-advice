"use client";

import { useEffect, type ReactNode } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";

/** Overlay/backdrop pattern (fixed inset-0, bg-black/60, role=dialog,
 * backdrop-click-closes via stopPropagation on the panel) matches the only
 * other modal in this app, AttachmentPreview's document-preview overlay -
 * reused rather than built one-off. Escape-to-close is new here (that
 * component doesn't have it) since this modal holds in-progress form input,
 * not just a read-only preview. */
export function VendorRequestModal({
  onClose,
  onDone,
  payeeNameRegister,
  payeeNameError,
  payeeAddressRegister,
  payeeAddressError,
  payeeGstinRegister,
  payeeGstinError,
  children,
}: {
  /** X button, backdrop click, Escape, and "Back to vendor search instead"
   * all call this - every one of them discards the in-progress request and
   * returns to normal vendor search, per the brief. */
  onClose: () => void;
  /** The one action that keeps the entered details and just hides the
   * overlay, leaving isNewVendorRequest true. */
  onDone: () => void;
  payeeNameRegister: UseFormRegisterReturn;
  payeeNameError?: string;
  payeeAddressRegister: UseFormRegisterReturn;
  payeeAddressError?: string;
  payeeGstinRegister: UseFormRegisterReturn;
  payeeGstinError?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Request to add vendor"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-[min(96vw,720px)] flex-col overflow-hidden rounded-md bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <p className="text-base font-semibold text-[#0b1f3a]">Request to add vendor</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close and discard this vendor request"
            className="rounded-md border border-gray-300 px-2.5 py-1 text-sm text-gray-700 hover:bg-gray-50"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field
                label="Vendor Name"
                required
                htmlFor="vendorRequestPayeeName"
                error={payeeNameError}
                help="This vendor isn't in our list yet - Finance will review this request alongside your submission."
              >
                <Input id="vendorRequestPayeeName" hasError={!!payeeNameError} {...payeeNameRegister} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Vendor Address" required htmlFor="vendorRequestPayeeAddress" error={payeeAddressError}>
                <Textarea id="vendorRequestPayeeAddress" rows={2} hasError={!!payeeAddressError} {...payeeAddressRegister} />
              </Field>
            </div>
            <Field label="GSTIN" htmlFor="vendorRequestPayeeGstin" error={payeeGstinError}>
              <Input
                id="vendorRequestPayeeGstin"
                placeholder="15-character GSTIN"
                hasError={!!payeeGstinError}
                {...payeeGstinRegister}
              />
            </Field>
          </div>

          {children}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium text-[#0b1f3a] underline hover:no-underline"
          >
            ← Back to vendor search instead
          </button>
          <button
            type="button"
            onClick={onDone}
            className="w-fit rounded-md bg-[#0b1f3a] px-4 py-2 text-sm font-medium text-white"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
