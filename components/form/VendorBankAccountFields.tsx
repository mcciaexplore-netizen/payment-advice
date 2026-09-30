"use client";

import { useEffect, useState } from "react";

export type VendorBankAccount = {
  id: string;
  bankAccountNo: string;
  bankIfsc: string;
  beneficiaryName: string;
  lastUsedAt: string | null;
};

type AppliedAccount = { bankAccountNo: string; bankIfsc: string; beneficiaryName: string };

/** Sits above the Bank Details fields on the regular Payment Advice (NEFT)
 * form. Fetches the selected vendor's known bank accounts and decides what
 * to do based on how many exist — this three-way split is the whole point
 * of the feature, so it lives in one place rather than being reconstructed
 * per caller:
 *   - zero: renders nothing, fields stay exactly as they are (blank/manual).
 *   - exactly one: auto-fills immediately and shows a verify-before-
 *     submitting note. Fields remain editable afterward.
 *   - more than one: NEVER auto-fills. Shows every known option (plus an
 *     explicit "None of these" manual-entry choice) and waits for the
 *     submitter to actively pick one before touching any field.
 *
 * Internally keyed by `vendorId` + the submitter's typed email (below) so a
 * change of either remounts a fresh instance instead of needing to manually
 * reset state inside an effect — a change of email matters because some
 * accounts may be restricted to specific submitters (see
 * `restrictedToEmails` in the schema and the GET route this fetches). */
function VendorBankAccountFieldsForVendor({
  vendorId,
  submitterEmail,
  onApply,
}: {
  vendorId: string;
  submitterEmail: string;
  onApply: (account: AppliedAccount | null) => void;
}) {
  const [accounts, setAccounts] = useState<VendorBankAccount[]>([]);
  const [choice, setChoice] = useState<string | null>(null); // an account id, "manual", or null (undecided)

  useEffect(() => {
    let cancelled = false;
    const url = `/api/vendors/${vendorId}/bank-accounts?email=${encodeURIComponent(submitterEmail)}`;
    fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { accounts?: VendorBankAccount[] } | null) => {
        if (cancelled || !data) return;
        const list = data.accounts ?? [];
        setAccounts(list);
        // Auto-fill only for the exactly-one case; multiple always waits
        // for an explicit choice — never guess which one is right. Any
        // account this submitter's email isn't allowed to see was already
        // excluded server-side, so this list is exactly what they may act on.
        if (list.length === 1) {
          const only = list[0];
          onApply({
            bankAccountNo: only.bankAccountNo,
            bankIfsc: only.bankIfsc,
            beneficiaryName: only.beneficiaryName,
          });
          setChoice(only.id);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onApply identity is not meant to retrigger this; vendorId/submitterEmail are fixed for the lifetime of this instance (see the remount-via-key wrapper below).
  }, [vendorId, submitterEmail]);

  if (accounts.length === 0) return null;

  const verifyNote = (
    <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
      These bank details were auto-filled from a previous submission for this vendor - please verify
      they&apos;re correct before submitting.
    </p>
  );

  if (accounts.length === 1) {
    return <div className="sm:col-span-2">{verifyNote}</div>;
  }

  return (
    <div className="sm:col-span-2 flex flex-col gap-2 rounded-md border border-[#0b1f3a]/20 bg-[#0b1f3a]/[0.02] p-3">
      <p className="text-xs font-medium text-[#0b1f3a]">
        This vendor has more than one bank account on file - select the correct one:
      </p>
      <div className="flex flex-col gap-1.5">
        {accounts.map((account) => (
          <label key={account.id} className="flex items-start gap-2 text-xs text-gray-700">
            <input
              type="radio"
              name="vendorBankAccountChoice"
              checked={choice === account.id}
              onChange={() => {
                setChoice(account.id);
                onApply({
                  bankAccountNo: account.bankAccountNo,
                  bankIfsc: account.bankIfsc,
                  beneficiaryName: account.beneficiaryName,
                });
              }}
              className="mt-0.5 accent-[#0b1f3a]"
            />
            <span>
              A/c ending in {account.bankAccountNo.slice(-4)}, IFSC {account.bankIfsc}
              {account.lastUsedAt
                ? ` - last used ${new Date(account.lastUsedAt).toLocaleDateString("en-IN")}`
                : ""}
            </span>
          </label>
        ))}
        <label className="flex items-start gap-2 text-xs text-gray-700">
          <input
            type="radio"
            name="vendorBankAccountChoice"
            checked={choice === "manual"}
            onChange={() => {
              setChoice("manual");
              onApply(null);
            }}
            className="mt-0.5 accent-[#0b1f3a]"
          />
          <span>None of these - enter new bank details</span>
        </label>
      </div>
      {choice && choice !== "manual" ? verifyNote : null}
    </div>
  );
}

export function VendorBankAccountFields({
  vendorId,
  submitterEmail,
  onApply,
}: {
  vendorId: string | undefined;
  submitterEmail: string;
  onApply: (account: AppliedAccount | null) => void;
}) {
  if (!vendorId) return null;
  const normalizedEmail = submitterEmail.trim().toLowerCase();
  return (
    <VendorBankAccountFieldsForVendor
      key={`${vendorId}:${normalizedEmail}`}
      vendorId={vendorId}
      submitterEmail={normalizedEmail}
      onApply={onApply}
    />
  );
}
