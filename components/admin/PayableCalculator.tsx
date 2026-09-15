"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  calculatePayable,
  TDS_PERCENTAGES,
  type TdsPercentage,
} from "@/lib/advice/payment-calculator";

function money(value: number | string): string {
  return Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2 });
}

function asTdsPercentage(value: string | null): TdsPercentage {
  const parsed = Number(value ?? 0);
  return TDS_PERCENTAGES.includes(parsed as TdsPercentage)
    ? (parsed as TdsPercentage)
    : 0;
}

function TdsChoices({
  name,
  value,
  onChange,
  disabled,
}: {
  name: string;
  value: TdsPercentage;
  onChange: (value: TdsPercentage) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {TDS_PERCENTAGES.map((percent) => (
        <label key={percent} className="flex items-center gap-1.5 text-sm text-gray-700">
          <input
            type="radio"
            name={name}
            value={percent}
            checked={value === percent}
            onChange={() => onChange(percent)}
            disabled={disabled}
          />
          {percent}%
        </label>
      ))}
    </div>
  );
}

export function PayableCalculator({
  adviceId,
  basicAmount,
  gstAmount,
  isAdvance,
  initialArrearsAmount,
  initialCurrentTdsPercent,
  initialPayableAmount,
  locked,
  canEdit,
}: {
  adviceId: string;
  basicAmount: string | null;
  gstAmount: string | null;
  isAdvance: boolean;
  initialArrearsAmount: string | null;
  initialCurrentTdsPercent: string | null;
  initialPayableAmount: string | null;
  locked: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [arrears, setArrears] = useState(
    initialArrearsAmount && Number(initialArrearsAmount) !== 0 ? initialArrearsAmount : "",
  );
  const [currentTdsPercent, setCurrentTdsPercent] = useState<TdsPercentage>(
    asTdsPercentage(initialCurrentTdsPercent),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const basic = Number(basicAmount ?? 0);
  const gst = Number(gstAmount ?? 0);
  const arrearsNumber = arrears.trim() === "" ? 0 : Number(arrears);
  const calculation = useMemo(
    () =>
      calculatePayable({
        basicAmount: Number.isFinite(basic) ? basic : 0,
        arrearsAmount: Number.isFinite(arrearsNumber) ? arrearsNumber : 0,
        currentTdsPercent,
      }),
    [basic, arrearsNumber, currentTdsPercent],
  );

  async function save() {
    setError(null);
    if (!Number.isFinite(arrearsNumber) || arrearsNumber < 0) {
      setError("Enter a valid non-negative arrears amount.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/advice/${adviceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          arrearsAmount: arrears.trim() === "" ? null : arrearsNumber,
          currentTdsPercent,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not save the payable calculation.");
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!basicAmount || basic <= 0) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        Basic Amount is unavailable for this historical submission. Finance cannot calculate its
        payable amount until Accounts confirms the Basic Amount.
      </div>
    );
  }

  if (locked && !initialPayableAmount) {
    return (
      <div className="rounded-md border border-gray-300 bg-gray-50 p-4 text-sm text-gray-700">
        This historical submission was processed before the Arrears/TDS payable calculator was
        introduced, so no calculator record is available.
      </div>
    );
  }

  const isReadOnly = locked || !canEdit;
  return (
    <div className="flex flex-col gap-4 rounded-md border border-[#2e8b57]/30 bg-[#2e8b57]/5 p-4 text-sm">
      <div>
        <p className="font-medium text-[#1e5c39]">Arrears &amp; TDS Payable Calculator</p>
        {locked ? (
          <p className="mt-1 text-xs text-gray-600">
            Locked because a payment has already been recorded. Values below are the permanent
            calculation used for the payment cap.
          </p>
        ) : null}
      </div>

      <label className="font-medium text-[#0b1f3a]">
        Arrears for Last Bill&apos;s Amount: Rs. <span className="font-normal text-gray-500">Optional</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={arrears}
          onChange={(event) => setArrears(event.target.value)}
          disabled={isReadOnly}
          className="admin-filter-input mt-1 w-full"
        />
      </label>

      <div className="grid gap-2 rounded-md bg-white p-3">
        <p>Basic Amount: <strong>₹ {money(basic)}</strong></p>
        {!isAdvance ? (
          <>
            <p>GST Amount: <strong>₹ {money(gst)}</strong></p>
            <p>Total Amount: <strong>₹ {money(basic + gst)}</strong></p>
          </>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <p className="font-medium text-[#0b1f3a]">Current TDS</p>
        <TdsChoices
          name={`current-tds-${adviceId}`}
          value={currentTdsPercent}
          onChange={setCurrentTdsPercent}
          disabled={isReadOnly}
        />
        <p className="text-gray-600">Current TDS Amount: ₹ {money(calculation.currentTdsAmount)}</p>
        {arrears.trim() !== "" ? (
          <p className="text-gray-600">
            Arrears TDS Amount: ₹ {money(calculation.arrearsTdsAmount)}
          </p>
        ) : null}
        <p className="font-medium text-[#0b1f3a]">
          Total TDS Amount: ₹ {money(calculation.totalTdsAmount)}
        </p>
      </div>

      <p className="rounded-md bg-[#0b1f3a] px-4 py-3 text-base font-medium text-white">
        Payable Amount: ₹ {money(initialPayableAmount && isReadOnly ? initialPayableAmount : calculation.payableAmount)}
      </p>

      {error ? <p className="font-medium text-[#b3261e]">{error}</p> : null}
      {!isReadOnly ? (
        <button
          type="button"
          onClick={save}
          disabled={saving || calculation.payableAmount <= 0}
          className="w-fit rounded-md border border-[#2e8b57] bg-white px-4 py-2 font-medium text-[#1e5c39] hover:bg-[#2e8b57]/5 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Payable Calculation"}
        </button>
      ) : null}
    </div>
  );
}
