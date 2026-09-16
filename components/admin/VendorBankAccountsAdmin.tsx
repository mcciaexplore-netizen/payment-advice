"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type AdminVendorBankAccount = {
  id: string;
  bankAccountNo: string;
  bankIfsc: string;
  beneficiaryName: string;
  lastUsedAt: Date | null;
  restrictedToEmails: string[] | null;
};

/** Finance Admin management of per-account visibility restrictions — see
 * `restricted_to_emails` on `vendor_bank_accounts`. An account with no
 * restrictions is visible to every submitter (today's default, unchanged);
 * adding one or more emails here hides it from everyone else, enforced
 * server-side in GET /api/vendors/[id]/bank-accounts. Built as a general
 * capability, not specific to any one vendor. */
export function VendorBankAccountsAdmin({ accounts }: { accounts: AdminVendorBankAccount[] }) {
  if (accounts.length === 0) {
    return <p className="text-sm text-gray-500">No saved bank accounts on file for this vendor yet.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {accounts.map((account) => (
        <AccountRow key={account.id} account={account} />
      ))}
    </div>
  );
}

function AccountRow({ account }: { account: AdminVendorBankAccount }) {
  const router = useRouter();
  const [emails, setEmails] = useState<string[]>(account.restrictedToEmails ?? []);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(next: string[]) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/vendor-bank-accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restrictedToEmails: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not save.");
        return;
      }
      setEmails(next);
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function addEmail() {
    const value = draft.trim().toLowerCase();
    if (!value) return;
    if (emails.includes(value)) {
      setDraft("");
      return;
    }
    void save([...emails, value]);
    setDraft("");
  }

  function removeEmail(email: string) {
    void save(emails.filter((e) => e !== email));
  }

  return (
    <div className="rounded-md border border-gray-200 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm font-medium text-[#0b1f3a]">
          A/c ending {account.bankAccountNo.slice(-4)} — {account.beneficiaryName}
        </div>
        <div className="text-xs text-gray-500">IFSC {account.bankIfsc}</div>
      </div>
      {account.lastUsedAt ? (
        <div className="mt-1 text-xs text-gray-400">
          Last used {new Date(account.lastUsedAt).toLocaleDateString("en-IN")}
        </div>
      ) : null}

      <div className="mt-3">
        {emails.length === 0 ? (
          <p className="text-xs text-gray-500">
            Visible to everyone. Add an email below to restrict who can see or use this account.
          </p>
        ) : (
          <>
            <p className="text-xs font-medium text-amber-800">
              Restricted — only visible to:
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {emails.map((email) => (
                <span
                  key={email}
                  className="flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-800"
                >
                  {email}
                  <button
                    type="button"
                    onClick={() => removeEmail(email)}
                    disabled={saving}
                    aria-label={`Remove ${email}`}
                    className="font-bold hover:text-amber-950 disabled:opacity-50"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          type="email"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addEmail();
            }
          }}
          placeholder="Add an allowed email…"
          className="admin-filter-input flex-1"
          disabled={saving}
        />
        <button
          type="button"
          onClick={addEmail}
          disabled={saving || !draft.trim()}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          Restrict to this email
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-[#b3261e]">{error}</p> : null}
    </div>
  );
}
