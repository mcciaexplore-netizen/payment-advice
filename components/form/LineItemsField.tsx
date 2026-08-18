"use client";

import { Control, FieldErrors, UseFormRegister, useFieldArray, useWatch } from "react-hook-form";
import { Input } from "@/components/ui/Input";
import {
  CashVoucherItem,
  PaymentAdviceFormInput,
  calculateCashVoucherTotal,
} from "@/lib/validation/payment-advice";

/** Free-text description + amount, "Add row" / "Remove" per row, live-
 * summed Total — the exact same pattern for both Cash Voucher's line
 * items and Advance Payment's Particulars breakdown (structurally
 * identical fields on the form schema, see cashVoucherItemSchema). Shared
 * here so neither place hand-rolls its own copy of this add/remove/sum
 * behavior. */
export function LineItemsField({
  name,
  heading,
  helpText,
  descriptionPlaceholder,
  register,
  control,
  errors,
}: {
  name: "cashVoucherItems" | "advanceParticulars";
  heading: string;
  helpText: string;
  descriptionPlaceholder: string;
  register: UseFormRegister<PaymentAdviceFormInput>;
  control: Control<PaymentAdviceFormInput>;
  errors: FieldErrors<PaymentAdviceFormInput>;
}) {
  const { fields, append, remove } = useFieldArray({ control, name });
  const watched = useWatch({ control, name }) as CashVoucherItem[] | undefined;
  const items = watched ?? [];
  const fieldErrors = errors[name];

  return (
    <div className="sm:col-span-2 rounded-md border border-[#0b1f3a]/20 bg-[#0b1f3a]/[0.02] p-4">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[#0b1f3a]">
            {heading} <span className="text-xs text-[#b3261e]">Required</span>
          </p>
          <p className="mt-1 text-xs text-gray-600">{helpText}</p>
        </div>
        <button
          type="button"
          onClick={() => append({ description: "", amount: 0 })}
          className="rounded-md border border-[#0b1f3a] px-3 py-1.5 text-sm font-medium text-[#0b1f3a] hover:bg-[#0b1f3a]/5"
        >
          Add row
        </button>
      </div>
      {fieldErrors?.message ? (
        <p className="mb-2 text-sm font-medium text-[#b3261e]">{fieldErrors.message}</p>
      ) : null}
      <div className="flex flex-col gap-2">
        {fields.map((field, index) => (
          <div key={field.id} className="grid grid-cols-[minmax(0,1fr)_9rem_auto] gap-2">
            <div>
              <Input
                placeholder={descriptionPlaceholder}
                hasError={!!fieldErrors?.[index]?.description}
                {...register(`${name}.${index}.description`)}
              />
              {fieldErrors?.[index]?.description ? (
                <p className="mt-1 text-xs font-medium text-[#b3261e]">
                  {fieldErrors[index]?.description?.message}
                </p>
              ) : null}
            </div>
            <div>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="Amount"
                hasError={!!fieldErrors?.[index]?.amount}
                {...register(`${name}.${index}.amount`, { valueAsNumber: true })}
              />
              {fieldErrors?.[index]?.amount ? (
                <p className="mt-1 text-xs font-medium text-[#b3261e]">
                  {fieldErrors[index]?.amount?.message}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              disabled={fields.length === 1}
              onClick={() => remove(index)}
              className="self-start rounded-md px-2 py-2 text-sm text-[#b3261e] hover:bg-[#b3261e]/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-end border-t border-[#0b1f3a]/15 pt-3 text-base font-semibold text-[#0b1f3a]">
        Total: ₹{" "}
        {calculateCashVoucherTotal(
          items.filter((item) => Number.isFinite(item?.amount) && item.amount > 0),
        ).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
      </div>
    </div>
  );
}
