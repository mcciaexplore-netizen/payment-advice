"use client";

import { Control, FieldErrors, UseFormRegister, useFieldArray, useWatch } from "react-hook-form";
import { FileUploadSlot } from "@/components/form/FileUploadSlot";
import { Input } from "@/components/ui/Input";
import {
  CashVoucherItem,
  PaymentAdviceFormInput,
  calculateCashVoucherTotal,
} from "@/lib/validation/payment-advice";

const MAX_EXPENSES = 10;

export function CashVoucherItemsField({
  register,
  control,
  errors,
  filesByItem,
  existingFileNames,
  onFilesChange,
  onItemRemoved,
  maxBillDate,
}: {
  register: UseFormRegister<PaymentAdviceFormInput>;
  control: Control<PaymentAdviceFormInput>;
  errors: FieldErrors<PaymentAdviceFormInput>;
  filesByItem: Record<string, File[]>;
  existingFileNames?: Record<string, string>;
  onFilesChange: (clientKey: string, files: File[]) => void;
  onItemRemoved: (clientKey: string) => void;
  maxBillDate: string;
}) {
  const { fields, append, remove } = useFieldArray({ control, name: "cashVoucherItems" });
  const watched = useWatch({ control, name: "cashVoucherItems" }) as CashVoucherItem[] | undefined;
  const items = watched ?? [];
  const fieldErrors = errors.cashVoucherItems;

  function addRow() {
    if (fields.length >= MAX_EXPENSES) return;
    append({
      clientKey: crypto.randomUUID(),
      billNo: "",
      billDate: undefined,
      description: "",
      amount: undefined as unknown as number,
    });
  }

  function removeRow(index: number, clientKey: string) {
    onItemRemoved(clientKey);
    remove(index);
  }

  return (
    <div className="sm:col-span-2 rounded-md border border-[#0b1f3a]/20 bg-[#0b1f3a]/[0.02] p-4">
      <div className="mb-4">
        <p className="text-sm font-medium text-[#0b1f3a]">
          Expense Details <span className="text-xs text-[#b3261e]">Required</span>
        </p>
        <p className="mt-1 text-xs text-gray-600">
          Add one row per expense. Each row must include its own bill or supplementary document.
        </p>
      </div>

      {fieldErrors?.message ? (
        <p className="mb-3 text-sm font-medium text-[#b3261e]">{fieldErrors.message}</p>
      ) : null}

      <div className="flex flex-col gap-4">
        {fields.map((field, index) => {
          const item = items[index];
          const clientKey = item?.clientKey ?? field.clientKey;
          const rowErrors = fieldErrors?.[index];
          return (
            <div key={field.id} className="rounded-md border border-gray-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-[#0b1f3a]">Expense {index + 1}</p>
                <button
                  type="button"
                  disabled={fields.length === 1}
                  onClick={() => removeRow(index, clientKey)}
                  className="rounded-md px-2 py-1 text-sm text-[#b3261e] hover:bg-[#b3261e]/5 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
              <input type="hidden" {...register(`cashVoucherItems.${index}.id`)} />
              <input type="hidden" {...register(`cashVoucherItems.${index}.clientKey`)} />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <RowField label="Bill Date" error={rowErrors?.billDate?.message}>
                  <Input type="date" max={maxBillDate} hasError={!!rowErrors?.billDate} {...register(`cashVoucherItems.${index}.billDate`)} />
                </RowField>
                <RowField label="Bill No." error={rowErrors?.billNo?.message}>
                  <Input hasError={!!rowErrors?.billNo} {...register(`cashVoucherItems.${index}.billNo`)} />
                </RowField>
                <RowField label="Nature of Expenditure" required error={rowErrors?.description?.message}>
                  <Input placeholder="Expenditure description" hasError={!!rowErrors?.description} {...register(`cashVoucherItems.${index}.description`)} />
                </RowField>
                <RowField label="Amount" required error={rowErrors?.amount?.message}>
                  <Input type="number" step="0.01" min="0.01" placeholder="Amount" hasError={!!rowErrors?.amount} {...register(`cashVoucherItems.${index}.amount`, { valueAsNumber: true })} />
                </RowField>
                <div className="md:col-span-2">
                  <FileUploadSlot
                    label="Attach Bill/Supplementary Document"
                    required
                    allowImages
                    maxFiles={1}
                    files={filesByItem[clientKey] ?? []}
                    onChange={(files) => onFilesChange(clientKey, files)}
                    existingFileNames={existingFileNames?.[clientKey] ? [existingFileNames[clientKey]] : undefined}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4">
        {fields.length < MAX_EXPENSES ? (
          <button
            type="button"
            onClick={addRow}
            className="rounded-md border border-[#0b1f3a] px-3 py-1.5 text-sm font-medium text-[#0b1f3a] hover:bg-[#0b1f3a]/5"
          >
            Add row
          </button>
        ) : (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Maximum 10 expenses per submission — contact Accounts if you need to submit more.
          </p>
        )}
      </div>

      <div className="mt-4 flex justify-end border-t border-[#0b1f3a]/15 pt-3 text-base font-semibold text-[#0b1f3a]">
        Total: ₹ {calculateCashVoucherTotal(items.filter((item) => Number.isFinite(item?.amount) && item.amount > 0)).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
      </div>
    </div>
  );
}

function RowField({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-baseline gap-2 text-sm font-medium text-[#0b1f3a]">
        <span>{label}</span>
        <span className={required ? "text-xs font-normal text-[#b3261e]" : "text-xs font-normal text-gray-400"}>{required ? "Required" : "Optional"}</span>
      </label>
      {children}
      {error ? <p role="alert" className="text-sm font-medium text-[#b3261e]">{error}</p> : null}
    </div>
  );
}
